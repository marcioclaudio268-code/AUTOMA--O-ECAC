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

import { SEM_RESPONSAVEL_LABEL } from '../src/modules/pendencias/pendencias.types';

const TEST_TIMEOUT = 120_000;
const ADMIN_EMAIL = 'admin@ecac.local';
const ADMIN_PASSWORD = 'admin123';
const JWT_SECRET = 'pendencias-integration-secret';
const TEST_DATABASE_NAME = 'ecac_automacao_pendencias_integration';
const API_ROOT = process.cwd();
const requireFromApi = createRequire(path.join(API_ROOT, 'package.json'));

process.env.JWT_SECRET = JWT_SECRET;

type RequestOptions = {
  body?: unknown;
  cookie?: string;
  method?: 'GET' | 'POST' | 'PATCH';
};

type SeededPendenciasData = {
  empresaAcessoBloqueadoId: string;
  empresaForaDaCarteiraId: string;
  empresaProcuracaoPendenteId: string;
  empresaSemResponsavelId: string;
  responsavelAId: string;
  responsavelBId: string;
};

let postgres: EmbeddedPostgres;
let prisma: PrismaClient;
let app: INestApplication | undefined;
let baseUrl = '';
let sessionCookie = '';
let tempRoot = '';
let postgresPort = 0;
let seededData: SeededPendenciasData;

beforeAll(async () => {
  tempRoot = await mkdtemp(
    path.join(os.tmpdir(), 'ecac-automacao-pendencias-it-')
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

  const [authModule, pendenciasModule] = (await Promise.all([
    importModuleFromDist('modules/auth/auth.module.js'),
    importModuleFromDist('modules/pendencias/pendencias.module.js')
  ])) as [AnyModuleNamespace, AnyModuleNamespace];

  const IntegrationTestModule = class IntegrationTestModule {};
  Module({
    imports: [
      ConfigModule.forRoot({
        ignoreEnvFile: true,
        isGlobal: true
      }),
      authModule.AuthModule,
      pendenciasModule.PendenciasModule
    ]
  })(IntegrationTestModule);

  prisma = new PrismaClient();
  seededData = await seedPendenciasData(prisma);

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

describe('pendencias derivadas local', () => {
  test('GET /pendencias responde 200 e deriva a fila corretamente', async () => {
    const response = await requestJson('/pendencias', {
      cookie: sessionCookie
    });

    expect(response.response.status).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);

    const items = response.body as Array<{
      empresaCnpj: string;
      empresaId: string;
      empresaNome: string;
      empresaNomeFantasia: string | null;
      linkTratamento: string;
      motivo: string;
      observacaoOperacional: string | null;
      responsavelInternoId: string | null;
      responsavelInternoNome: string;
      statusAtual: string;
      tipoPendencia: string;
      ultimaConferenciaOperacionalEm: string | null;
    }>;

    expect(items).toHaveLength(6);
    expect(items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          empresaNome: 'Empresa Acesso Bloqueado Ltda',
          statusAtual: 'BLOQUEADO',
          tipoPendencia: 'ACESSO'
        }),
        expect.objectContaining({
          empresaNome: 'Empresa Procuracao Pendente Ltda',
          statusAtual: 'PENDENTE',
          tipoPendencia: 'PROCURACAO'
        }),
        expect.objectContaining({
          empresaNome: 'Empresa Sem Responsavel Ltda',
          responsavelInternoId: null,
          responsavelInternoNome: SEM_RESPONSAVEL_LABEL
        })
      ])
    );

    expect(items.map((item) => item.tipoPendencia)).toEqual(
      expect.arrayContaining(['ACESSO', 'PROCURACAO', 'OPERACIONAL'])
    );
    expect(
      items.every((item) => item.linkTratamento === `/empresas/${item.empresaId}`)
    ).toBe(true);
    expect(
      items.some((item) => item.empresaNome.includes('Fora da Carteira'))
    ).toBe(false);
  }, TEST_TIMEOUT);

  test('filtra por responsavelInternoId e tipoPendencia', async () => {
    const responsavelResponse = await requestJson(
      `/pendencias?responsavelInternoId=${seededData.responsavelBId}`,
      {
        cookie: sessionCookie
      }
    );

    expect(responsavelResponse.response.status).toBe(200);
    const responsavelItems = responsavelResponse.body as Array<{
      responsavelInternoId: string | null;
      tipoPendencia: string;
    }>;

    expect(responsavelItems).toHaveLength(2);
    expect(
      responsavelItems.every(
        (item) => item.responsavelInternoId === seededData.responsavelBId
      )
    ).toBe(true);

    const tipoResponse = await requestJson('/pendencias?tipoPendencia=OPERACIONAL', {
      cookie: sessionCookie
    });

    expect(tipoResponse.response.status).toBe(200);
    const tipoItems = tipoResponse.body as Array<{
      linkTratamento: string;
      tipoPendencia: string;
    }>;

    expect(tipoItems).toHaveLength(2);
    expect(tipoItems.every((item) => item.tipoPendencia === 'OPERACIONAL')).toBe(
      true
    );
    expect(
      tipoItems.every((item) => item.linkTratamento.startsWith('/empresas/'))
    ).toBe(true);
  }, TEST_TIMEOUT);

  test('filtra por empresaId e nao retorna fora da carteira', async () => {
    const empresaResponse = await requestJson(
      `/pendencias?empresaId=${seededData.empresaSemResponsavelId}`,
      {
        cookie: sessionCookie
      }
    );

    expect(empresaResponse.response.status).toBe(200);
    const empresaItems = empresaResponse.body as Array<{
      empresaId: string;
      responsavelInternoId: string | null;
      tipoPendencia: string;
    }>;

    expect(empresaItems).toHaveLength(3);
    expect(
      empresaItems.every(
        (item) => item.empresaId === seededData.empresaSemResponsavelId
      )
    ).toBe(true);
    expect(
      empresaItems.every((item) => item.responsavelInternoId === null)
    ).toBe(true);

    const foraDaCarteiraResponse = await requestJson(
      `/pendencias?empresaId=${seededData.empresaForaDaCarteiraId}`,
      {
        cookie: sessionCookie
      }
    );

    expect(foraDaCarteiraResponse.response.status).toBe(200);
    expect(foraDaCarteiraResponse.body).toEqual([]);
  }, TEST_TIMEOUT);
});

async function seedPendenciasData(
  database: PrismaClient
): Promise<SeededPendenciasData> {
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

  const empresaRegular = await database.empresa.create({
    data: {
      cnpj: '11111111000191',
      naCarteira: true,
      nomeFantasia: 'Carteira Regular',
      pendenciaOperacional: false,
      razaoSocial: 'Empresa Regular Ltda',
      regimeTributario: RegimeTributario.SIMPLES_NACIONAL,
      responsavelInternoId: responsavelA.id,
      statusAcesso: StatusAcessoEmpresa.DISPONIVEL,
      statusProcuracao: StatusProcuracaoEmpresa.VALIDA
    }
  });

  const empresaAcessoBloqueado = await database.empresa.create({
    data: {
      cnpj: '22222222000172',
      naCarteira: true,
      nomeFantasia: 'Carteira Bloqueada',
      pendenciaOperacional: false,
      razaoSocial: 'Empresa Acesso Bloqueado Ltda',
      regimeTributario: RegimeTributario.LUCRO_PRESUMIDO,
      responsavelInternoId: responsavelA.id,
      statusAcesso: StatusAcessoEmpresa.BLOQUEADO,
      statusProcuracao: StatusProcuracaoEmpresa.VALIDA
    }
  });

  const empresaProcuracaoPendente = await database.empresa.create({
    data: {
      cnpj: '33333333000163',
      naCarteira: true,
      nomeFantasia: 'Carteira Pendente',
      pendenciaOperacional: true,
      razaoSocial: 'Empresa Procuracao Pendente Ltda',
      regimeTributario: RegimeTributario.LUCRO_REAL,
      responsavelInternoId: responsavelB.id,
      statusAcesso: StatusAcessoEmpresa.DISPONIVEL,
      statusProcuracao: StatusProcuracaoEmpresa.PENDENTE
    }
  });

  const empresaSemResponsavel = await database.empresa.create({
    data: {
      cnpj: '44444444000154',
      naCarteira: true,
      nomeFantasia: 'Carteira Sem Responsavel',
      pendenciaOperacional: true,
      razaoSocial: 'Empresa Sem Responsavel Ltda',
      regimeTributario: RegimeTributario.OUTRO,
      statusAcesso: StatusAcessoEmpresa.NAO_VERIFICADO,
      statusProcuracao: StatusProcuracaoEmpresa.NAO_VERIFICADA
    }
  });

  const empresaForaDaCarteira = await database.empresa.create({
    data: {
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
  });

  return {
    empresaAcessoBloqueadoId: empresaAcessoBloqueado.id,
    empresaForaDaCarteiraId: empresaForaDaCarteira.id,
    empresaProcuracaoPendenteId: empresaProcuracaoPendente.id,
    empresaSemResponsavelId: empresaSemResponsavel.id,
    responsavelAId: responsavelA.id,
    responsavelBId: responsavelB.id
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
