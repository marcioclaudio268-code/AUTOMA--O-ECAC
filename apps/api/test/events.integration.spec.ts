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
  StatusAcessoEmpresa,
  StatusProcuracaoEmpresa
} from '@prisma/client';
import EmbeddedPostgres from 'embedded-postgres';
import * as bcrypt from 'bcrypt';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

const TEST_TIMEOUT = 120_000;
const ADMIN_EMAIL = 'admin@ecac.local';
const ADMIN_PASSWORD = 'admin123';
const JWT_SECRET = 'events-integration-secret';
const TEST_DATABASE_NAME = 'ecac_automacao_events_integration';
const API_ROOT = process.cwd();
const requireFromApi = createRequire(path.join(API_ROOT, 'package.json'));

process.env.JWT_SECRET = JWT_SECRET;

type RequestOptions = {
  body?: unknown;
  cookie?: string;
  method?: 'GET' | 'POST' | 'PATCH';
};

type SeededEventsData = {
  empresaIrregularId: string;
  empresaRegularId: string;
};

let postgres: EmbeddedPostgres;
let prisma: PrismaClient;
let app: INestApplication | undefined;
let baseUrl = '';
let sessionCookie = '';
let tempRoot = '';
let postgresPort = 0;
let seededData: SeededEventsData;

beforeAll(async () => {
  tempRoot = await mkdtemp(path.join(os.tmpdir(), 'ecac-automacao-events-it-'));
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

  const [authModule, scansModule, eventsModule] = (await Promise.all([
    importModuleFromDist('modules/auth/auth.module.js'),
    importModuleFromDist('modules/scans/scans.module.js'),
    importModuleFromDist('modules/events/events.module.js')
  ])) as [AnyModuleNamespace, AnyModuleNamespace, AnyModuleNamespace];

  const IntegrationTestModule = class IntegrationTestModule {};
  Module({
    imports: [
      ConfigModule.forRoot({
        ignoreEnvFile: true,
        isGlobal: true
      }),
      authModule.AuthModule,
      scansModule.ScansModule,
      eventsModule.EventsModule
    ]
  })(IntegrationTestModule);

  prisma = new PrismaClient();
  seededData = await seedEventsData(prisma);

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

describe('eventos operacionais por varredura local', () => {
  test('gera evento relevante quando a varredura encontra irregularidade', async () => {
    const scanResponse = await requestJson(
      `/companies/${seededData.empresaIrregularId}/scans/manual`,
      {
        cookie: sessionCookie,
        method: 'POST'
      }
    );

    expect(scanResponse.response.status).toBe(201);

    const eventResponse = await requestJson(
      `/companies/${seededData.empresaIrregularId}/events/recent`,
      {
        cookie: sessionCookie
      }
    );

    expect(eventResponse.response.status).toBe(200);
    const items = eventResponse.body as Array<{
      descricao: string;
      empresaId: string;
      id: string;
      tipoEvento: string;
      varreduraId: string;
    }>;

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      empresaId: seededData.empresaIrregularId,
      tipoEvento: 'VARREDURA_RELEVANTE',
      varreduraId: (scanResponse.body as {
        varredura: { id: string };
      }).varredura.id
    });
    expect(items[0]?.descricao).toContain('Acesso irregular');
    expect(items[0]?.descricao).toContain('Procuracao irregular');
    expect(items[0]?.descricao).toContain('Pendencia operacional manual');
  }, TEST_TIMEOUT);

  test('nao gera evento quando a empresa permanece regular', async () => {
    const scanResponse = await requestJson(
      `/companies/${seededData.empresaRegularId}/scans/manual`,
      {
        cookie: sessionCookie,
        method: 'POST'
      }
    );

    expect(scanResponse.response.status).toBe(201);

    const eventResponse = await requestJson(
      `/companies/${seededData.empresaRegularId}/events/recent`,
      {
        cookie: sessionCookie
      }
    );

    expect(eventResponse.response.status).toBe(200);
    expect(eventResponse.body).toEqual([]);
  }, TEST_TIMEOUT);

  test('gera evento de mudanca de estado quando a situacao muda entre varreduras', async () => {
    const firstScan = await requestJson(
      `/companies/${seededData.empresaIrregularId}/scans/manual`,
      {
        cookie: sessionCookie,
        method: 'POST'
      }
    );

    expect(firstScan.response.status).toBe(201);

    const beforeChangeEvents = await requestJson(
      `/companies/${seededData.empresaIrregularId}/events/recent?take=2`,
      {
        cookie: sessionCookie
      }
    );

    expect(beforeChangeEvents.response.status).toBe(200);
    expect(beforeChangeEvents.body).toHaveLength(2);
    expect(
      (beforeChangeEvents.body as Array<{ tipoEvento: string }>)[0]?.tipoEvento
    ).toBe('VARREDURA_RELEVANTE');
    expect(
      (beforeChangeEvents.body as Array<{ tipoEvento: string }>)[1]?.tipoEvento
    ).toBe('VARREDURA_RELEVANTE');

    await prisma.empresa.update({
      data: {
        pendenciaOperacional: false,
        statusAcesso: StatusAcessoEmpresa.DISPONIVEL,
        statusProcuracao: StatusProcuracaoEmpresa.VALIDA
      },
      where: {
        id: seededData.empresaIrregularId
      }
    });

    await pause(20);

    const secondScan = await requestJson(
      `/companies/${seededData.empresaIrregularId}/scans/manual`,
      {
        cookie: sessionCookie,
        method: 'POST'
      }
    );

    expect(secondScan.response.status).toBe(201);

    const eventResponse = await requestJson(
      `/companies/${seededData.empresaIrregularId}/events/recent?take=2`,
      {
        cookie: sessionCookie
      }
    );

    expect(eventResponse.response.status).toBe(200);
    const items = eventResponse.body as Array<{
      descricao: string;
      empresaId: string;
      id: string;
      tipoEvento: string;
      varreduraId: string;
    }>;

    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      tipoEvento: 'MUDANCA_ESTADO',
      varreduraId: (secondScan.body as {
        varredura: { id: string };
      }).varredura.id
    });
    expect(items[0]?.descricao).toContain(
      'Estado operacional regular confirmado'
    );
    expect(items[1]?.tipoEvento).toBe('VARREDURA_RELEVANTE');
    expect(items[1]?.descricao).toContain('Acesso irregular');
  }, TEST_TIMEOUT);
});

async function seedEventsData(
  database: PrismaClient
): Promise<SeededEventsData> {
  const adminSenhaHash = await bcrypt.hash(ADMIN_PASSWORD, 10);

  const admin = await database.usuarioInterno.create({
    data: {
      ativo: true,
      email: ADMIN_EMAIL,
      nome: 'Admin ECAC',
      perfil: PerfilUsuario.ADMIN,
      senhaHash: adminSenhaHash
    }
  });

  const responsavel = await database.responsavelInterno.create({
    data: {
      ativo: true,
      email: 'responsavel.eventos@ecac.local',
      nome: 'Responsavel Eventos',
      usuarioInternoId: admin.id
    }
  });

  const empresaIrregular = await database.empresa.create({
    data: {
      cnpj: '66666666000136',
      naCarteira: true,
      nomeFantasia: 'Eventos Irregular',
      pendenciaOperacional: true,
      razaoSocial: 'Empresa Eventos Irregular Ltda',
      regimeTributario: RegimeTributario.SIMPLES_NACIONAL,
      responsavelInternoId: responsavel.id,
      statusAcesso: StatusAcessoEmpresa.BLOQUEADO,
      statusProcuracao: StatusProcuracaoEmpresa.PENDENTE
    }
  });

  const empresaRegular = await database.empresa.create({
    data: {
      cnpj: '77777777000128',
      naCarteira: true,
      nomeFantasia: 'Eventos Regular',
      pendenciaOperacional: false,
      razaoSocial: 'Empresa Eventos Regular Ltda',
      regimeTributario: RegimeTributario.LUCRO_PRESUMIDO,
      responsavelInternoId: responsavel.id,
      statusAcesso: StatusAcessoEmpresa.DISPONIVEL,
      statusProcuracao: StatusProcuracaoEmpresa.VALIDA
    }
  });

  return {
    empresaIrregularId: empresaIrregular.id,
    empresaRegularId: empresaRegular.id
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
  const result = spawnSync(process.execPath, [tscCli, '-p', 'tsconfig.build.json'], {
    cwd: API_ROOT,
    encoding: 'utf8',
    env: process.env
  });

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

async function pause(ms: number): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, ms);
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
