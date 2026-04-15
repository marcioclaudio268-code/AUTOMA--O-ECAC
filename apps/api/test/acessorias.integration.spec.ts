import 'reflect-metadata';

import { spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { rmSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import * as net from 'node:net';
import * as os from 'node:os';
import * as path from 'node:path';

import type { INestApplication } from '@nestjs/common';
import { Module, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { PerfilUsuario, PrismaClient } from '@prisma/client';
import EmbeddedPostgres from 'embedded-postgres';
import * as bcrypt from 'bcrypt';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

const TEST_TIMEOUT = 120_000;
const ADMIN_EMAIL = 'admin@ecac.local';
const ADMIN_PASSWORD = 'admin123';
const JWT_SECRET = 'acessorias-integration-secret';
const TEST_DATABASE_NAME = 'ecac_automacao_acessorias_integration';
const VALID_TOKEN = 'token-bom';
const INVALID_TOKEN = 'token-ruim';
const API_ROOT = process.cwd();
const requireFromApi = createRequire(path.join(API_ROOT, 'package.json'));

process.env.JWT_SECRET = JWT_SECRET;

type RequestOptions = {
  body?: unknown;
  cookie?: string;
  method?: 'GET' | 'POST' | 'PATCH';
};

let postgres: EmbeddedPostgres;
let prisma: PrismaClient;
let app: INestApplication | undefined;
let baseUrl = '';
let sessionCookie = '';
let tempRoot = '';
let postgresPort = 0;
let validationServerUrl = '';
let validationServer: ReturnType<typeof createServer> | undefined;
let lastAuthorizationHeader = '';
let expectedToken = VALID_TOKEN;

beforeAll(async () => {
  tempRoot = await mkdtemp(
    path.join(os.tmpdir(), 'ecac-automacao-acessorias-it-')
  );
  const databaseDir = path.join(tempRoot, 'postgres');
  postgresPort = await getFreePort();

  postgres = new EmbeddedPostgres({
    databaseDir,
    password: 'password',
    persistent: true,
    port: postgresPort,
    user: 'postgres'
  });

  await postgres.initialise();
  await postgres.start();
  await postgres.createDatabase(TEST_DATABASE_NAME);

  validationServer = createServer((request, response) => {
    lastAuthorizationHeader = String(request.headers.authorization ?? '');

    if (lastAuthorizationHeader === `Bearer ${expectedToken}`) {
      response.writeHead(200, {
        'content-type': 'application/json'
      });
      response.end(JSON.stringify({ ok: true }));
      return;
    }

    response.writeHead(401, {
      'content-type': 'application/json'
    });
    response.end(
      JSON.stringify({
        error: 'Unauthorized',
        message: 'Token invalido.'
      })
    );
  });

  validationServerUrl = await startServer(validationServer!);

  process.env.DATABASE_URL = `postgresql://postgres:password@127.0.0.1:${postgresPort}/${TEST_DATABASE_NAME}?schema=public`;
  process.env.DIRECT_URL = process.env.DATABASE_URL;
  process.env.JWT_SECRET = JWT_SECRET;
  process.env.ACESSORIAS_TOKEN_ENCRYPTION_KEY = 'acessorias-encryption-secret';
  process.env.ACESSORIAS_TEST_CONNECTION_URL = validationServerUrl;

  runPrismaMigrateDeploy();
  runBackendBuild();

  const [authModule, acessoriasModule] = (await Promise.all([
    importModuleFromDist('modules/auth/auth.module.js'),
    importModuleFromDist('modules/integrations/acessorias/acessorias.module.js')
  ])) as [AnyModuleNamespace, AnyModuleNamespace];

  const IntegrationTestModule = class IntegrationTestModule {};
  Module({
    imports: [
      ConfigModule.forRoot({
        ignoreEnvFile: true,
        isGlobal: true
      }),
      authModule.AuthModule,
      acessoriasModule.AcessoriasModule
    ]
  })(IntegrationTestModule);

  prisma = new PrismaClient();
  await seedUsers(prisma);

  app = await NestFactory.create(IntegrationTestModule, {
    logger: ['error']
  });
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true
    })
  );

  await app.listen(0, '127.0.0.1');
  baseUrl = await app.getUrl();
  sessionCookie = await loginAndGetCookie();
}, TEST_TIMEOUT);

afterAll(async () => {
  if (app) {
    await app.close();
  }

  if (prisma) {
    await prisma.$disconnect();
  }

  if (validationServer) {
    await stopServer(validationServer);
  }

  if (postgres) {
    await postgres.stop();
  }

  if (tempRoot) {
    await removeDirectoryWithRetry(tempRoot);
  }
}, TEST_TIMEOUT);

describe('integracao Acessorias local', () => {
  test('persiste a configuracao com token criptografado e retorna leitura mascarada', async () => {
    const created = await requestJson('/integracoes/acessorias/config', {
      body: {
        apiToken: VALID_TOKEN
      },
      cookie: sessionCookie,
      method: 'POST'
    });

    expect(created.response.status).toBe(201);
    expect(created.body).toMatchObject({
      apiTokenConfigurado: true,
      apiTokenMascarado: '********',
      status: 'CONFIGURADA'
    });
    expect(JSON.stringify(created.body)).not.toContain(VALID_TOKEN);

    const persisted = await prisma.integracaoAcessoriasConfig.findUniqueOrThrow(
      {
        where: {
          id: 'acessorias-config'
        }
      }
    );

    expect(persisted.apiTokenCriptografado).not.toBe(VALID_TOKEN);
    expect(persisted.apiTokenCriptografado).toContain('v1:');

    const fetched = await requestJson('/integracoes/acessorias/config', {
      cookie: sessionCookie
    });

    expect(fetched.response.status).toBe(200);
    expect(fetched.body).toMatchObject({
      apiTokenConfigurado: true,
      apiTokenMascarado: '********',
      status: 'CONFIGURADA'
    });
    expect(JSON.stringify(fetched.body)).not.toContain(VALID_TOKEN);
  }, TEST_TIMEOUT);

  test('testa a conexao, registra sucesso e envia o token persistido', async () => {
    expectedToken = VALID_TOKEN;
    lastAuthorizationHeader = '';

    const response = await requestJson('/integracoes/acessorias/test-connection', {
      cookie: sessionCookie,
      method: 'POST'
    });

    expect(response.response.status).toBe(200);
    expect(response.body).toMatchObject({
      success: true,
      message: 'Conexao com Acessorias validada.',
      config: {
        status: 'ATIVA'
      },
      job: {
        falhas: 0,
        status: 'SUCESSO',
        tipoJob: 'TESTE_CONEXAO'
      }
    });
    expect(lastAuthorizationHeader).toBe(`Bearer ${VALID_TOKEN}`);

    const config = await prisma.integracaoAcessoriasConfig.findUniqueOrThrow({
      where: {
        id: 'acessorias-config'
      }
    });

    expect(config.status).toBe('ATIVA');
    expect(config.mensagemErroAtual).toBeNull();
    expect(config.ultimoErroEm).toBeNull();
  }, TEST_TIMEOUT);

  test('atualiza o token, registra falha auditavel e reflete o erro na configuracao', async () => {
    const updated = await requestJson('/integracoes/acessorias/config', {
      body: {
        apiToken: INVALID_TOKEN
      },
      cookie: sessionCookie,
      method: 'PATCH'
    });

    expect(updated.response.status).toBe(200);
    expect(updated.body).toMatchObject({
      apiTokenConfigurado: true,
      apiTokenMascarado: '********',
      status: 'CONFIGURADA'
    });

    expectedToken = VALID_TOKEN;
    lastAuthorizationHeader = '';

    const failed = await requestJson('/integracoes/acessorias/test-connection', {
      cookie: sessionCookie,
      method: 'POST'
    });

    expect(failed.response.status).toBe(200);
    expect(failed.body).toMatchObject({
      success: false,
      config: {
        status: 'ERRO'
      },
      job: {
        falhas: 1,
        status: 'FALHA',
        tipoJob: 'TESTE_CONEXAO'
      }
    });
    expect(String((failed.body as { message?: string }).message ?? '')).toContain(
      '401'
    );
    expect(lastAuthorizationHeader).toBe(`Bearer ${INVALID_TOKEN}`);

    const config = await prisma.integracaoAcessoriasConfig.findUniqueOrThrow({
      where: {
        id: 'acessorias-config'
      }
    });

    expect(config.status).toBe('ERRO');
    expect(config.mensagemErroAtual).toContain('401');
    expect(config.ultimoErroEm).not.toBeNull();
  }, TEST_TIMEOUT);

  test('lista jobs recentes em ordem decrescente', async () => {
    const response = await requestJson('/integracoes/acessorias/jobs?take=2', {
      cookie: sessionCookie
    });

    expect(response.response.status).toBe(200);
    const items = response.body as Array<{
      detalhesErro: string | null;
      id: string;
      status: string;
      tipoJob: string;
    }>;

    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      status: 'FALHA',
      tipoJob: 'TESTE_CONEXAO'
    });
    expect(items[1]).toMatchObject({
      status: 'SUCESSO',
      tipoJob: 'TESTE_CONEXAO'
    });
    expect(items[0]?.detalhesErro).toContain('401');
    expect(items[1]?.detalhesErro).toBeNull();
  }, TEST_TIMEOUT);
});

async function seedUsers(database: PrismaClient): Promise<void> {
  const adminSenhaHash = await bcrypt.hash(ADMIN_PASSWORD, 10);

  await database.usuarioInterno.create({
    data: {
      ativo: true,
      email: ADMIN_EMAIL,
      nome: 'Admin ECAC',
      perfil: PerfilUsuario.ADMIN,
      senhaHash: adminSenhaHash
    }
  });
}

async function loginAndGetCookie(): Promise<string> {
  const response = await requestJson('/auth/login', {
    body: {
      email: ADMIN_EMAIL,
      senha: ADMIN_PASSWORD
    },
    method: 'POST'
  });

  if (response.response.status !== 200) {
    throw new Error(
      `Login de teste falhou com status ${response.response.status}: ${JSON.stringify(response.body)}`
    );
  }

  const setCookie = response.response.headers.get('set-cookie');
  if (!setCookie) {
    throw new Error('Auth login nao retornou cookie de sessao.');
  }

  return setCookie.split(';', 1)[0] ?? setCookie;
}

async function requestJson(pathname: string, options: RequestOptions = {}) {
  const headers: Record<string, string> = {
    accept: 'application/json'
  };

  if (options.cookie) {
    headers.cookie = options.cookie;
  }

  if (options.body !== undefined) {
    headers['content-type'] = 'application/json';
  }

  const response = await fetch(new URL(pathname, baseUrl), {
    body:
      options.body === undefined ? undefined : JSON.stringify(options.body),
    headers,
    method: options.method ?? 'GET'
  });

  const text = await response.text();
  const body = text ? parseJson(text, pathname) : null;

  return {
    body,
    response,
    text
  };
}

function parseJson(text: string, pathname: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    throw new Error(
      `Nao foi possivel decodificar JSON em ${pathname}: ${text}. Erro original: ${String(error)}`
    );
  }
}

function runPrismaMigrateDeploy(): void {
  const env = {
    ...process.env,
    DATABASE_URL: process.env.DATABASE_URL,
    DIRECT_URL: process.env.DIRECT_URL
  };

  const prismaCli = path.join(
    API_ROOT,
    'node_modules',
    'prisma',
    'build',
    'index.js'
  );
  const result = spawnSync(
    process.execPath,
    [prismaCli, 'migrate', 'deploy', '--schema', 'src/prisma/schema.prisma'],
    {
      cwd: API_ROOT,
      encoding: 'utf8',
      env
    }
  );

  if (result.error || result.status !== 0) {
    throw new Error(
      [
        'Falha ao executar prisma migrate deploy.',
        `status: ${String(result.status)}`,
        `stdout: ${result.stdout ?? ''}`,
        `stderr: ${result.stderr ?? ''}`,
        result.error ? `error: ${String(result.error)}` : ''
      ]
        .filter(Boolean)
        .join('\n')
    );
  }
}

function runBackendBuild(): void {
  rmSync(path.join(API_ROOT, 'tsconfig.build.tsbuildinfo'), {
    force: true
  });

  const tscCli = path.join(
    API_ROOT,
    'node_modules',
    'typescript',
    'lib',
    'tsc.js'
  );
  const result = spawnSync(
    process.execPath,
    [tscCli, '-p', 'tsconfig.build.json'],
    {
      cwd: API_ROOT,
      encoding: 'utf8',
      env: process.env
    }
  );

  if (result.error || result.status !== 0) {
    throw new Error(
      [
        'Falha ao executar tsc build.',
        `status: ${String(result.status)}`,
        `stdout: ${result.stdout ?? ''}`,
        `stderr: ${result.stderr ?? ''}`,
        result.error ? `error: ${String(result.error)}` : ''
      ]
        .filter(Boolean)
        .join('\n')
    );
  }
}

type AnyModuleNamespace = Record<string, any>;

async function importModuleFromDist(
  relativePath: string
): Promise<AnyModuleNamespace> {
  const modulePath = path.join(API_ROOT, 'dist', relativePath);
  return requireFromApi(modulePath) as AnyModuleNamespace;
}

async function getFreePort(): Promise<number> {
  return await new Promise<number>((resolve, reject) => {
    const server = net.createServer();

    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();

      if (!address || typeof address === 'string') {
        reject(new Error('Nao foi possivel obter uma porta livre.'));
        return;
      }

      const port = address.port;

      server.close((closeError) => {
        if (closeError) {
          reject(closeError);
          return;
        }

        resolve(port);
      });
    });
  });
}

async function startServer(server: ReturnType<typeof createServer>): Promise<string> {
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();

      if (!address || typeof address === 'string') {
        reject(new Error('Nao foi possivel iniciar o servidor auxiliar.'));
        return;
      }

      server.off('error', reject);
      resolve();
    });
  });

  const address = server.address();

  if (!address || typeof address === 'string') {
    throw new Error('Nao foi possivel obter a porta do servidor auxiliar.');
  }

  return `http://127.0.0.1:${address.port}`;
}

async function stopServer(server: ReturnType<typeof createServer>): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

async function removeDirectoryWithRetry(target: string): Promise<void> {
  const attempts = 10;

  for (let index = 0; index < attempts; index += 1) {
    try {
      await rm(target, { force: true, recursive: true });
      return;
    } catch (error) {
      if (index === attempts - 1 || !isRetryableRemoveError(error)) {
        throw error;
      }

      await new Promise((resolve) => {
        setTimeout(resolve, 500);
      });
    }
  }
}

function isRetryableRemoveError(error: unknown): boolean {
  if (!error || typeof error !== 'object' || !('code' in error)) {
    return false;
  }

  const code = (error as NodeJS.ErrnoException).code;
  return code === 'EBUSY' || code === 'EPERM' || code === 'ENOTEMPTY';
}
