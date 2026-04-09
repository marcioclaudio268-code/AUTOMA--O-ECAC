import 'reflect-metadata';

import { spawnSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import * as path from 'node:path';
import * as os from 'node:os';
import * as net from 'node:net';

import { Module, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
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
const JWT_SECRET = 'dashboard-integration-secret';
const TEST_DATABASE_NAME = 'ecac_automacao_dashboard_integration';
const API_ROOT = process.cwd();
const requireFromApi = createRequire(path.join(API_ROOT, 'package.json'));

process.env.JWT_SECRET = JWT_SECRET;

type JsonRecord = Record<string, unknown>;

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

beforeAll(async () => {
  tempRoot = await mkdtemp(path.join(os.tmpdir(), 'ecac-automacao-dashboard-it-'));
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

  const [authModule, dashboardModule] = (await Promise.all([
    importModuleFromDist('modules/auth/auth.module.js'),
    importModuleFromDist('modules/dashboard/dashboard.module.js')
  ])) as [AnyModuleNamespace, AnyModuleNamespace];

  const IntegrationTestModule = class IntegrationTestModule {};
  Module({
    imports: [
      ConfigModule.forRoot({
        ignoreEnvFile: true,
        isGlobal: true
      }),
      authModule.AuthModule,
      dashboardModule.DashboardModule
    ]
  })(IntegrationTestModule);

  prisma = new PrismaClient();
  await seedDashboardData(prisma);

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

describe('dashboard summary local', () => {
  test('GET /dashboard/summary responde 200 e consolida a carteira corretamente', async () => {
    const response = await requestJson('/dashboard/summary', {
      cookie: sessionCookie
    });

    expect(response.response.status).toBe(200);
    expect(response.body).toMatchObject({
      totalEmpresasNaCarteira: 4,
      totalEmpresasComPendenciaOperacional: 2,
      totalEmpresasComAcessoPendenteOuBloqueado: 3,
      totalEmpresasComProcuracaoPendente: 3
    });

    const resumo = response.body as {
      distribuicaoPorResponsavel: Array<{
        responsavelInternoId: string | null;
        responsavelNome: string;
        totalEmpresas: number;
      }>;
    };

    expect(Array.isArray(resumo.distribuicaoPorResponsavel)).toBe(true);
    expect(
      resumo.distribuicaoPorResponsavel.reduce(
        (accumulator, item) => accumulator + item.totalEmpresas,
        0
      )
    ).toBe(4);

    expect(resumo.distribuicaoPorResponsavel).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          responsavelNome: 'Responsavel A',
          totalEmpresas: 2
        }),
        expect.objectContaining({
          responsavelNome: 'Responsavel B',
          totalEmpresas: 1
        }),
        expect.objectContaining({
          responsavelInternoId: null,
          responsavelNome: 'Sem responsável',
          totalEmpresas: 1
        })
      ])
    );
  }, TEST_TIMEOUT);
});

async function seedDashboardData(database: PrismaClient): Promise<void> {
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

  const responsavelA = await database.responsavelInterno.create({
    data: {
      ativo: true,
      email: 'responsavel.a@ecac.local',
      nome: 'Responsavel A',
      usuarioInternoId: admin.id
    }
  });

  const responsavelB = await database.responsavelInterno.create({
    data: {
      ativo: true,
      email: 'responsavel.b@ecac.local',
      nome: 'Responsavel B',
      usuarioInternoId: admin.id
    }
  });

  await database.empresa.createMany({
    data: [
      {
        cnpj: '11111111000191',
        naCarteira: true,
        nomeFantasia: 'Carteira A',
        pendenciaOperacional: false,
        razaoSocial: 'Empresa Carteira A Ltda',
        regimeTributario: RegimeTributario.SIMPLES_NACIONAL,
        responsavelInternoId: responsavelA.id,
        statusAcesso: StatusAcessoEmpresa.DISPONIVEL,
        statusProcuracao: StatusProcuracaoEmpresa.VALIDA
      },
      {
        cnpj: '22222222000172',
        naCarteira: true,
        nomeFantasia: 'Carteira B',
        pendenciaOperacional: true,
        razaoSocial: 'Empresa Carteira B Ltda',
        regimeTributario: RegimeTributario.LUCRO_PRESUMIDO,
        responsavelInternoId: responsavelA.id,
        statusAcesso: StatusAcessoEmpresa.INDISPONIVEL,
        statusProcuracao: StatusProcuracaoEmpresa.PENDENTE
      },
      {
        cnpj: '33333333000163',
        naCarteira: true,
        nomeFantasia: 'Carteira C',
        pendenciaOperacional: false,
        razaoSocial: 'Empresa Carteira C Ltda',
        regimeTributario: RegimeTributario.LUCRO_REAL,
        responsavelInternoId: responsavelB.id,
        statusAcesso: StatusAcessoEmpresa.BLOQUEADO,
        statusProcuracao: StatusProcuracaoEmpresa.INVALIDA
      },
      {
        cnpj: '44444444000154',
        naCarteira: true,
        nomeFantasia: 'Carteira Sem Responsavel',
        pendenciaOperacional: true,
        razaoSocial: 'Empresa Carteira Sem Responsavel Ltda',
        regimeTributario: RegimeTributario.OUTRO,
        statusAcesso: StatusAcessoEmpresa.NAO_VERIFICADO,
        statusProcuracao: StatusProcuracaoEmpresa.NAO_VERIFICADA
      },
      {
        cnpj: '55555555000145',
        naCarteira: false,
        nomeFantasia: 'Fora da Carteira',
        pendenciaOperacional: true,
        razaoSocial: 'Empresa Fora da Carteira Ltda',
        regimeTributario: RegimeTributario.SIMPLES_NACIONAL,
        responsavelInternoId: responsavelB.id,
        statusAcesso: StatusAcessoEmpresa.BLOQUEADO,
        statusProcuracao: StatusProcuracaoEmpresa.PENDENTE
      }
    ]
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

  const tscCli = path.join(API_ROOT, 'node_modules', 'typescript', 'lib', 'tsc.js');
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
