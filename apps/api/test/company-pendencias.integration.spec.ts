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
  PrioridadePendencia,
  RegimeTributario,
  ResultadoLogExecucao,
  StatusAcessoEmpresa,
  StatusProcuracaoEmpresa,
  StatusPendencia,
  TipoLogExecucao,
  TipoPendencia
} from '@prisma/client';
import EmbeddedPostgres from 'embedded-postgres';
import * as bcrypt from 'bcrypt';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

const TEST_TIMEOUT = 120_000;
const ADMIN_EMAIL = 'admin@ecac.local';
const ADMIN_PASSWORD = 'admin123';
const JWT_SECRET = 'company-traceability-integration-secret';
const TEST_DATABASE_NAME =
  'ecac_automacao_company_traceability_integration';
const API_ROOT = process.cwd();
const requireFromApi = createRequire(path.join(API_ROOT, 'package.json'));

process.env.JWT_SECRET = JWT_SECRET;

type RequestOptions = {
  body?: unknown;
  cookie?: string;
  method?: 'GET' | 'POST' | 'PATCH';
};

type SeededCompanyTraceabilityData = {
  empresaCheckId: string;
  empresaCreateId: string;
  empresaRegularizeId: string;
  empresaRemoveId: string;
  pendenciaRegularizeId: string;
};

let postgres: EmbeddedPostgres;
let prisma: PrismaClient;
let app: INestApplication | undefined;
let baseUrl = '';
let sessionCookie = '';
let tempRoot = '';
let postgresPort = 0;
let seededData: SeededCompanyTraceabilityData;

beforeAll(async () => {
  tempRoot = await mkdtemp(
    path.join(os.tmpdir(), 'ecac-automacao-company-traceability-it-')
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

  const [authModule, companiesModule] = (await Promise.all([
    importModuleFromDist('modules/auth/auth.module.js'),
    importModuleFromDist('modules/companies/companies.module.js')
  ])) as [AnyModuleNamespace, AnyModuleNamespace];

  const IntegrationTestModule = class IntegrationTestModule {};
  Module({
    imports: [
      ConfigModule.forRoot({
        ignoreEnvFile: true,
        isGlobal: true
      }),
      authModule.AuthModule,
      companiesModule.CompaniesModule
    ]
  })(IntegrationTestModule);

  prisma = new PrismaClient();
  seededData = await seedCompanyTraceabilityData(prisma);

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

describe('rastreabilidade operacional da empresa', () => {
  test('registrar pendencia cria Pendencia e LogExecucao e marca a empresa como pendente', async () => {
    const response = await requestJson(
      `/companies/${seededData.empresaCreateId}/pendencias`,
      {
        body: {
          descricao: 'Pendencia operacional criada via API.',
          origem: 'CARTEIRA',
          prioridade: PrioridadePendencia.ALTA,
          tipo: TipoPendencia.OPERACIONAL,
          titulo: 'Pendencia operacional manual'
        },
        cookie: sessionCookie,
        method: 'POST'
      }
    );

    expect(response.response.status).toBe(201);

    const pendencia = response.body as {
      empresaId: string;
      fechadaEm: string | null;
      id: string;
      prioridade: PrioridadePendencia;
      responsavelInternoId: string | null;
      status: StatusPendencia;
      tipo: TipoPendencia;
    };

    expect(pendencia).toMatchObject({
      empresaId: seededData.empresaCreateId,
      prioridade: PrioridadePendencia.ALTA,
      status: StatusPendencia.ABERTA,
      tipo: TipoPendencia.OPERACIONAL
    });
    expect(pendencia.fechadaEm).toBeNull();

    const empresa = await prisma.empresa.findUnique({
      select: {
        pendenciaOperacional: true,
        regularizadaEm: true
      },
      where: {
        id: seededData.empresaCreateId
      }
    });

    expect(empresa).toMatchObject({
      pendenciaOperacional: true,
      regularizadaEm: null
    });

    const pendencias = await prisma.pendencia.findMany({
      where: {
        empresaId: seededData.empresaCreateId
      }
    });
    expect(pendencias).toHaveLength(1);
    expect(pendencias[0]?.status).toBe(StatusPendencia.ABERTA);

    const logs = await prisma.logExecucao.findMany({
      orderBy: {
        executadoEm: 'desc'
      },
      where: {
        empresaId: seededData.empresaCreateId
      }
    });

    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      pendenciaId: pendencia.id,
      resultado: ResultadoLogExecucao.SUCESSO,
      tipo: TipoLogExecucao.REGISTRO_PENDENCIA
    });

    const logsResponse = await requestJson(
      `/companies/${seededData.empresaCreateId}/logs`,
      {
        cookie: sessionCookie
      }
    );

    expect(logsResponse.response.status).toBe(200);
    expect(logsResponse.body).toHaveLength(1);
    expect(
      (logsResponse.body as Array<{ tipo: string }>)[0]?.tipo
    ).toBe(TipoLogExecucao.REGISTRO_PENDENCIA);

    const historyResponse = await requestJson(
      `/companies/${seededData.empresaCreateId}/operational-history`,
      {
        cookie: sessionCookie
      }
    );

    expect(historyResponse.response.status).toBe(200);
    expect(historyResponse.body).toMatchObject({
      empresaId: seededData.empresaCreateId
    });
    expect(
      (historyResponse.body as { logs: unknown[]; pendencias: unknown[] }).logs
    ).toHaveLength(1);
    expect(
      (historyResponse.body as { logs: unknown[]; pendencias: unknown[] })
        .pendencias
    ).toHaveLength(1);
  }, TEST_TIMEOUT);

  test('conferir agora grava LogExecucao e atualiza ultimaConferenciaOperacionalEm', async () => {
    const response = await requestJson(
      `/companies/${seededData.empresaCheckId}/operational/check`,
      {
        body: {
          chaveIdempotencia: 'company-check'
        },
        cookie: sessionCookie,
        method: 'POST'
      }
    );

    expect(response.response.status).toBe(201);
    expect(response.body).toMatchObject({
      updatedAt: expect.any(String)
    });

    const empresa = await prisma.empresa.findUnique({
      select: {
        ultimaConferenciaOperacionalEm: true
      },
      where: {
        id: seededData.empresaCheckId
      }
    });

    expect(empresa?.ultimaConferenciaOperacionalEm).not.toBeNull();
    expect(
      empresa?.ultimaConferenciaOperacionalEm?.toISOString()
    ).toBe((response.body as { updatedAt: string }).updatedAt);

    const logs = await prisma.logExecucao.findMany({
      orderBy: {
        executadoEm: 'desc'
      },
      where: {
        empresaId: seededData.empresaCheckId
      }
    });

    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      resultado: ResultadoLogExecucao.SUCESSO,
      tipo: TipoLogExecucao.CONFERENCIA_OPERACIONAL
    });
  }, TEST_TIMEOUT);

  test('regularizar pendencia fecha Pendencia, grava LogExecucao e ajusta o resumo da empresa', async () => {
    const response = await requestJson(
      `/companies/${seededData.empresaRegularizeId}/operational/regularize`,
      {
        body: {
          pendenciaId: seededData.pendenciaRegularizeId
        },
        cookie: sessionCookie,
        method: 'POST'
      }
    );

    expect(response.response.status).toBe(201);
    const pendencia = response.body as {
      fechadaEm: string | null;
      id: string;
      status: StatusPendencia;
      tipo: TipoPendencia;
    };

    expect(pendencia).toMatchObject({
      id: seededData.pendenciaRegularizeId,
      status: StatusPendencia.RESOLVIDA,
      tipo: TipoPendencia.OPERACIONAL
    });
    expect(pendencia.fechadaEm).not.toBeNull();

    const empresa = await prisma.empresa.findUnique({
      select: {
        pendenciaOperacional: true,
        regularizadaEm: true
      },
      where: {
        id: seededData.empresaRegularizeId
      }
    });

    expect(empresa).toMatchObject({
      pendenciaOperacional: false
    });
    expect(empresa?.regularizadaEm).not.toBeNull();

    const pendenciaPersistida = await prisma.pendencia.findUnique({
      where: {
        id: seededData.pendenciaRegularizeId
      }
    });

    expect(pendenciaPersistida).toMatchObject({
      status: StatusPendencia.RESOLVIDA
    });
    expect(pendenciaPersistida?.fechadaEm).not.toBeNull();

    const logs = await prisma.logExecucao.findMany({
      orderBy: {
        executadoEm: 'desc'
      },
      where: {
        empresaId: seededData.empresaRegularizeId
      }
    });

    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      pendenciaId: seededData.pendenciaRegularizeId,
      resultado: ResultadoLogExecucao.SUCESSO,
      tipo: TipoLogExecucao.REGULARIZACAO_PENDENCIA
    });
  }, TEST_TIMEOUT);

  test('retirar da carteira grava LogExecucao e ajusta naCarteira', async () => {
    const response = await requestJson(
      `/companies/${seededData.empresaRemoveId}/operational/remove-from-wallet`,
      {
        body: {
          chaveIdempotencia: 'company-remove'
        },
        cookie: sessionCookie,
        method: 'POST'
      }
    );

    expect(response.response.status).toBe(201);
    expect(response.body).toMatchObject({
      updatedAt: expect.any(String)
    });

    const empresa = await prisma.empresa.findUnique({
      select: {
        naCarteira: true
      },
      where: {
        id: seededData.empresaRemoveId
      }
    });

    expect(empresa?.naCarteira).toBe(false);

    const logs = await prisma.logExecucao.findMany({
      orderBy: {
        executadoEm: 'desc'
      },
      where: {
        empresaId: seededData.empresaRemoveId
      }
    });

    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      resultado: ResultadoLogExecucao.SUCESSO,
      tipo: TipoLogExecucao.RETIRADA_CARTEIRA
    });
  }, TEST_TIMEOUT);
});

async function seedCompanyTraceabilityData(
  database: PrismaClient
): Promise<SeededCompanyTraceabilityData> {
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
      email: 'responsavel.traceabilidade@ecac.local',
      nome: 'Responsavel Traceabilidade',
      usuarioInternoId: admin.id
    }
  });

  const empresaCreate = await database.empresa.create({
    data: {
      cnpj: '11111111000191',
      naCarteira: true,
      nomeFantasia: 'Empresa Criar Pendencia',
      pendenciaOperacional: false,
      razaoSocial: 'Empresa Criar Pendencia Ltda',
      regimeTributario: RegimeTributario.SIMPLES_NACIONAL,
      responsavelInternoId: responsavel.id,
      statusAcesso: StatusAcessoEmpresa.DISPONIVEL,
      statusProcuracao: StatusProcuracaoEmpresa.VALIDA
    }
  });

  const empresaCheck = await database.empresa.create({
    data: {
      cnpj: '22222222000172',
      naCarteira: true,
      nomeFantasia: 'Empresa Conferencia',
      pendenciaOperacional: false,
      razaoSocial: 'Empresa Conferencia Ltda',
      regimeTributario: RegimeTributario.LUCRO_PRESUMIDO,
      responsavelInternoId: responsavel.id,
      statusAcesso: StatusAcessoEmpresa.DISPONIVEL,
      statusProcuracao: StatusProcuracaoEmpresa.VALIDA
    }
  });

  const empresaRegularize = await database.empresa.create({
    data: {
      cnpj: '33333333000163',
      naCarteira: true,
      nomeFantasia: 'Empresa Regularizacao',
      pendenciaOperacional: true,
      razaoSocial: 'Empresa Regularizacao Ltda',
      regimeTributario: RegimeTributario.LUCRO_REAL,
      responsavelInternoId: responsavel.id,
      statusAcesso: StatusAcessoEmpresa.BLOQUEADO,
      statusProcuracao: StatusProcuracaoEmpresa.PENDENTE
    }
  });

  const pendenciaRegularize = await database.pendencia.create({
    data: {
      abertaEm: new Date('2026-04-01T10:00:00.000Z'),
      descricao: 'Pendencia operacional aberta para regularizacao.',
      empresaId: empresaRegularize.id,
      origem: 'MANUAL',
      prioridade: PrioridadePendencia.ALTA,
      responsavelInternoId: responsavel.id,
      status: StatusPendencia.ABERTA,
      tipo: TipoPendencia.OPERACIONAL,
      titulo: 'Pendencia operacional manual'
    }
  });

  const empresaRemove = await database.empresa.create({
    data: {
      cnpj: '44444444000154',
      naCarteira: true,
      nomeFantasia: 'Empresa Remocao',
      pendenciaOperacional: false,
      razaoSocial: 'Empresa Remocao Ltda',
      regimeTributario: RegimeTributario.OUTRO,
      responsavelInternoId: responsavel.id,
      statusAcesso: StatusAcessoEmpresa.DISPONIVEL,
      statusProcuracao: StatusProcuracaoEmpresa.VALIDA
    }
  });

  return {
    empresaCheckId: empresaCheck.id,
    empresaCreateId: empresaCreate.id,
    empresaRegularizeId: empresaRegularize.id,
    empresaRemoveId: empresaRemove.id,
    pendenciaRegularizeId: pendenciaRegularize.id
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
