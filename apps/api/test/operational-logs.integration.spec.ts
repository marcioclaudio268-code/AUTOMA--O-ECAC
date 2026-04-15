import 'reflect-metadata';

import { spawnSync } from 'node:child_process';
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
import {
  PerfilUsuario,
  PrismaClient,
  RegimeTributario,
  ResultadoLogExecucao,
  StatusAcessoEmpresa,
  StatusProcuracaoEmpresa,
  TipoLogExecucao
} from '@prisma/client';
import EmbeddedPostgres from 'embedded-postgres';
import * as bcrypt from 'bcrypt';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

const TEST_TIMEOUT = 120_000;
const ADMIN_EMAIL = 'admin@ecac.local';
const ADMIN_PASSWORD = 'admin123';
const JWT_SECRET = 'operational-logs-integration-secret';
const TEST_DATABASE_NAME = 'ecac_automacao_operational_logs_integration';
const API_ROOT = process.cwd();
const requireFromApi = createRequire(path.join(API_ROOT, 'package.json'));

process.env.JWT_SECRET = JWT_SECRET;

type RequestOptions = {
  body?: unknown;
  cookie?: string;
  method?: 'GET' | 'POST' | 'PATCH';
};

type SeededOperationalLogsData = {
  companyId: string;
  manualLogId: string;
};

let postgres: EmbeddedPostgres;
let prisma: PrismaClient;
let app: INestApplication | undefined;
let baseUrl = '';
let sessionCookie = '';
let tempRoot = '';
let postgresPort = 0;
let seededData: SeededOperationalLogsData;

beforeAll(async () => {
  tempRoot = await mkdtemp(
    path.join(os.tmpdir(), 'ecac-automacao-operational-logs-it-')
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

  process.env.DATABASE_URL = `postgresql://postgres:password@127.0.0.1:${postgresPort}/${TEST_DATABASE_NAME}?schema=public`;
  process.env.DIRECT_URL = process.env.DATABASE_URL;
  process.env.JWT_SECRET = JWT_SECRET;

  runPrismaMigrateDeploy();
  runBackendBuild();

  const [authModule, companiesModule, logsModule] = (await Promise.all([
    importModuleFromDist('modules/auth/auth.module.js'),
    importModuleFromDist('modules/companies/companies.module.js'),
    importModuleFromDist('modules/logs/logs.module.js')
  ])) as [AnyModuleNamespace, AnyModuleNamespace, AnyModuleNamespace];

  const IntegrationTestModule = class IntegrationTestModule {};
  Module({
    imports: [
      ConfigModule.forRoot({
        ignoreEnvFile: true,
        isGlobal: true
      }),
      authModule.AuthModule,
      companiesModule.CompaniesModule,
      logsModule.LogsModule
    ]
  })(IntegrationTestModule);

  prisma = new PrismaClient();
  seededData = await seedOperationalLogsData(prisma);

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

  if (postgres) {
    await postgres.stop();
  }

  if (tempRoot) {
    await removeDirectoryWithRetry(tempRoot);
  }
}, TEST_TIMEOUT);

describe('operational logs local', () => {
  test('conferencia operacional registra log e o historico consome o shape correto', async () => {
    const initialLogsResponse = await requestJson(
      `/companies/${seededData.companyId}/logs?take=6`,
      {
        cookie: sessionCookie
      }
    );

    expect(initialLogsResponse.response.status).toBe(200);
    expect(initialLogsResponse.body).toHaveLength(1);
    expect(
      (initialLogsResponse.body as Array<{
        executadoPorUsuarioInternoId: string | null;
        executadoPorUsuarioInternoNome: string;
        id: string;
        tipo: string;
      }>)[0]
    ).toMatchObject({
      executadoPorUsuarioInternoId: null,
      executadoPorUsuarioInternoNome: 'Sistema',
      id: seededData.manualLogId,
      tipo: TipoLogExecucao.CONFERENCIA_OPERACIONAL
    });

    const historyBeforeResponse = await requestJson(
      `/companies/${seededData.companyId}/operational-history?take=6`,
      {
        cookie: sessionCookie
      }
    );

    expect(historyBeforeResponse.response.status).toBe(200);
    expect(historyBeforeResponse.body).toMatchObject({
      empresaId: seededData.companyId,
      empresa: {
        empresaId: seededData.companyId,
        responsavelInternoId: null,
        responsavelInternoNome: null
      },
      ultimoLog: {
        id: seededData.manualLogId,
        executadoPorUsuarioInternoNome: 'Sistema',
        resultado: ResultadoLogExecucao.SUCESSO
      }
    });
    expect(
      (historyBeforeResponse.body as { logs: unknown[] }).logs
    ).toHaveLength(1);

    const checkResponse = await requestJson(
      `/companies/${seededData.companyId}/operational/check`,
      {
        body: {},
        cookie: sessionCookie,
        method: 'POST'
      }
    );

    expect(checkResponse.response.status).toBe(201);
    expect(checkResponse.body).toMatchObject({
      updatedAt: expect.any(String)
    });

    const companyAfterCheck = await prisma.empresa.findUnique({
      select: {
        ultimaConferenciaOperacionalEm: true
      },
      where: {
        id: seededData.companyId
      }
    });

    expect(companyAfterCheck?.ultimaConferenciaOperacionalEm).not.toBeNull();

    const historyAfterResponse = await requestJson(
      `/companies/${seededData.companyId}/operational-history?take=6`,
      {
        cookie: sessionCookie
      }
    );

    expect(historyAfterResponse.response.status).toBe(200);

    const historyAfterBody = historyAfterResponse.body as {
      empresa: {
        ultimaConferenciaOperacionalEm: string | null;
      };
      logs: Array<{
        executadoPorUsuarioInternoNome: string;
        id: string;
        tipo: string;
      }>;
      ultimoLog: {
        executadoPorUsuarioInternoNome: string;
        id: string;
        tipo: string;
      } | null;
    };

    expect(historyAfterBody.logs).toHaveLength(2);
    expect(historyAfterBody.empresa.ultimaConferenciaOperacionalEm).not.toBeNull();
    expect(historyAfterBody.ultimoLog).toMatchObject({
      executadoPorUsuarioInternoNome: 'Admin ECAC',
      tipo: TipoLogExecucao.CONFERENCIA_OPERACIONAL
    });
    expect(historyAfterBody.logs[1]).toMatchObject({
      executadoPorUsuarioInternoNome: 'Sistema',
      id: seededData.manualLogId,
      tipo: TipoLogExecucao.CONFERENCIA_OPERACIONAL
    });
  }, TEST_TIMEOUT);
});

async function seedOperationalLogsData(
  database: PrismaClient
): Promise<SeededOperationalLogsData> {
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

  const company = await database.empresa.create({
    data: {
      cnpj: '55555555000155',
      naCarteira: true,
      observacoesOperacionais: 'Empresa importada sem responsavel interno.',
      pendenciaOperacional: false,
      razaoSocial: 'Empresa Importada Sem Responsavel Ltda',
      regimeTributario: RegimeTributario.SIMPLES_NACIONAL,
      statusAcesso: StatusAcessoEmpresa.NAO_VERIFICADO,
      statusProcuracao: StatusProcuracaoEmpresa.NAO_VERIFICADA
    }
  });

  const manualLog = await database.logExecucao.create({
    data: {
      empresaId: company.id,
      executadoEm: new Date('2026-04-10T10:00:00.000Z'),
      resultado: ResultadoLogExecucao.SUCESSO,
      resumo: 'Conferencia operacional criada manualmente.',
      tipo: TipoLogExecucao.CONFERENCIA_OPERACIONAL
    }
  });

  return {
    companyId: company.id,
    manualLogId: manualLog.id
  };
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
