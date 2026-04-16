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
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
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
let expectedToken = VALID_TOKEN;
let lastAuthorizationHeader = '';
let externalCompaniesPayload: Array<Record<string, unknown>> = [];
let probeStatusCode = 200;

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
    const pathname = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
    lastAuthorizationHeader = String(request.headers.authorization ?? '');

    if (pathname === '/probe') {
      if (lastAuthorizationHeader === `Bearer ${expectedToken}`) {
        response.writeHead(probeStatusCode, {
          'content-type': 'application/json'
        });
        response.end(
          JSON.stringify(
            probeStatusCode >= 200 && probeStatusCode < 300
              ? { ok: true }
              : {
                  error: 'ProbeError',
                  message: `Probe mock respondeu ${probeStatusCode}.`
                }
          )
        );
        return;
      }

      response.writeHead(401, { 'content-type': 'application/json' });
      response.end(
        JSON.stringify({
          error: 'Unauthorized',
          message: 'Token invalido.'
        })
      );
      return;
    }

    if (pathname === '/companies') {
      if (lastAuthorizationHeader !== `Bearer ${expectedToken}`) {
        response.writeHead(401, { 'content-type': 'application/json' });
        response.end(
          JSON.stringify({
            error: 'Unauthorized',
            message: 'Token invalido.'
          })
        );
        return;
      }

      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(
        JSON.stringify({
          items: externalCompaniesPayload,
          nextCursor: null
        })
      );
      return;
    }

    response.writeHead(404, { 'content-type': 'application/json' });
    response.end(
      JSON.stringify({
        error: 'Not Found',
        message: 'Rota auxiliar nao encontrada.'
      })
    );
  });

  validationServerUrl = await startServer(validationServer!);

  process.env.DATABASE_URL = `postgresql://postgres:password@127.0.0.1:${postgresPort}/${TEST_DATABASE_NAME}?schema=public`;
  process.env.DIRECT_URL = process.env.DATABASE_URL;
  process.env.JWT_SECRET = JWT_SECRET;
  process.env.ACESSORIAS_TOKEN_ENCRYPTION_KEY = 'acessorias-encryption-secret';
  process.env.ACESSORIAS_TEST_CONNECTION_URL = `${validationServerUrl}/probe`;
  process.env.ACESSORIAS_EMPRESAS_URL = `${validationServerUrl}/companies`;

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

  app = await NestFactory.create(IntegrationTestModule, { logger: ['error'] });
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

describe('Acessorias integration', () => {
  test('persiste configuracao e mascara token na leitura', async () => {
    const created = await requestJson('/integracoes/acessorias/config', {
      body: { apiToken: VALID_TOKEN },
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
        where: { id: 'acessorias-config' }
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
  }, TEST_TIMEOUT);

  test('testa a conexao com sucesso e com fallback local quando a url dedicada responde 404', async () => {
    await requestJson('/integracoes/acessorias/config', {
      body: { apiToken: VALID_TOKEN },
      cookie: sessionCookie,
      method: 'PATCH'
    });

    probeStatusCode = 200;
    lastAuthorizationHeader = '';
    const success = await requestJson('/integracoes/acessorias/test-connection', {
      cookie: sessionCookie,
      method: 'POST'
    });

    expect(success.response.status).toBe(200);
    expect(success.body).toMatchObject({
      success: true,
      config: { status: 'ATIVA' },
      job: { status: 'SUCESSO', tipoJob: 'TESTE_CONEXAO', falhas: 0 }
    });
    expect(lastAuthorizationHeader).toBe(`Bearer ${VALID_TOKEN}`);

    probeStatusCode = 404;
    lastAuthorizationHeader = '';
    const fallback = await requestJson('/integracoes/acessorias/test-connection', {
      cookie: sessionCookie,
      method: 'POST'
    });

    expect(fallback.response.status).toBe(200);
    expect(fallback.body).toMatchObject({
      success: true,
      config: { status: 'ATIVA' },
      job: { status: 'SUCESSO', tipoJob: 'TESTE_CONEXAO', falhas: 0 }
    });
    expect(String((fallback.body as { message?: string }).message ?? '')).toContain(
      'ACESSORIAS_TEST_CONNECTION_URL respondeu 404'
    );
    expect(String((fallback.body as { message?: string }).message ?? '')).toContain(
      'ACESSORIAS_EMPRESAS_URL'
    );

    probeStatusCode = 500;
    lastAuthorizationHeader = '';
    const failure = await requestJson('/integracoes/acessorias/test-connection', {
      cookie: sessionCookie,
      method: 'POST'
    });

    expect(failure.response.status).toBe(200);
    expect(failure.body).toMatchObject({
      success: false,
      config: { status: 'ERRO' },
      job: { status: 'FALHA', tipoJob: 'TESTE_CONEXAO', falhas: 1 }
    });
    expect(String((failure.body as { message?: string }).message ?? '')).toContain(
      '500'
    );

    const config = await prisma.integracaoAcessoriasConfig.findUniqueOrThrow({
      where: { id: 'acessorias-config' }
    });

    expect(config.status).toBe('ERRO');
    expect(config.mensagemErroAtual).toContain('500');
  }, TEST_TIMEOUT);

  test('sincroniza empresas, aplica match conservador, permite vinculo manual e nao duplica registros', async () => {
    const empresaAuto = await prisma.empresa.create({
      data: {
        cnpj: '11111111000191',
        naCarteira: true,
        nomeFantasia: 'Empresa Auto ECAC',
        pendenciaOperacional: false,
        razaoSocial: 'Empresa Auto ECAC Ltda',
        regimeTributario: RegimeTributario.SIMPLES_NACIONAL,
        responsavelInternoId: null,
        statusAcesso: StatusAcessoEmpresa.NAO_VERIFICADO,
        statusProcuracao: StatusProcuracaoEmpresa.NAO_VERIFICADA
      }
    });

    const empresaManual = await prisma.empresa.create({
      data: {
        cnpj: '22222222000172',
        naCarteira: true,
        nomeFantasia: 'Empresa Manual ECAC',
        pendenciaOperacional: false,
        razaoSocial: 'Empresa Manual ECAC Ltda',
        regimeTributario: RegimeTributario.SIMPLES_NACIONAL,
        responsavelInternoId: null,
        statusAcesso: StatusAcessoEmpresa.NAO_VERIFICADO,
        statusProcuracao: StatusProcuracaoEmpresa.NAO_VERIFICADA
      }
    });

    externalCompaniesPayload = [
      {
        cnpj: '11111111000191',
        id: 'ext-auto-1',
        razaoSocial: 'Empresa Externa Auto Ltda'
      },
      {
        cnpj: '33333333000153',
        id: 'ext-pending-1',
        razaoSocial: 'Empresa Externa Pendente Ltda'
      },
      {
        cnpj: '44444444000134',
        id: 'ext-amb-1',
        razaoSocial: 'Empresa Externa Ambigua 1 Ltda'
      },
      {
        cnpj: '44444444000134',
        id: 'ext-amb-2',
        razaoSocial: 'Empresa Externa Ambigua 2 Ltda'
      }
    ];
    expectedToken = VALID_TOKEN;
    await requestJson('/integracoes/acessorias/config', {
      body: { apiToken: VALID_TOKEN },
      cookie: sessionCookie,
      method: 'PATCH'
    });

    const sync = await requestJson('/integracoes/acessorias/empresas/sync', {
      cookie: sessionCookie,
      method: 'POST'
    });

    expect(sync.response.status).toBe(200);
    expect(sync.body).toMatchObject({
      job: { status: 'SUCESSO', tipoJob: 'SINCRONIZACAO_EMPRESAS' },
      summary: {
        atualizados: 0,
        criados: 4,
        falhas: 0,
        ignorados: 0,
        pendentes: 3,
        processados: 4,
        vinculadosAutomaticamente: 1
      }
    });

    const vinculos = await prisma.acessoriasEmpresaVinculo.findMany({
      orderBy: { acessoriasEmpresaId: 'asc' }
    });

    expect(vinculos).toHaveLength(4);
    expect(vinculos.find((item) => item.acessoriasEmpresaId === 'ext-auto-1')).toMatchObject({
      empresaId: empresaAuto.id,
      matchAutomatico: true,
      statusVinculo: 'VINCULADA'
    });
    expect(vinculos.filter((item) => item.statusVinculo === 'AMBIGUA')).toHaveLength(2);

    const secondSync = await requestJson('/integracoes/acessorias/empresas/sync', {
      cookie: sessionCookie,
      method: 'POST'
    });

    expect(secondSync.response.status).toBe(200);
    expect(secondSync.body).toMatchObject({
      summary: {
        atualizados: 4,
        criados: 0,
        falhas: 0,
        ignorados: 0,
        processados: 4
      }
    });

    const syncJob = await prisma.acessoriasSyncJob.findFirstOrThrow({
      orderBy: { createdAt: 'desc' },
      where: { tipoJob: 'SINCRONIZACAO_EMPRESAS' }
    });

    expect(syncJob.status).toBe('SUCESSO');
    expect(syncJob.processados).toBe(4);

    const linkResponse = await requestJson(
      `/integracoes/acessorias/empresas/${empresaManual.id}/link`,
      {
        body: { acessoriasEmpresaId: 'ext-pending-1' },
        cookie: sessionCookie,
        method: 'POST'
      }
    );

    expect(linkResponse.response.status).toBe(200);
    expect(linkResponse.body).toMatchObject({
      empresaId: empresaManual.id,
      statusVinculo: 'VINCULADA'
    });

    const unlinkResponse = await requestJson(
      `/integracoes/acessorias/empresas/${empresaManual.id}/link`,
      {
        cookie: sessionCookie,
        method: 'DELETE'
      }
    );

    expect(unlinkResponse.response.status).toBe(200);
    expect(unlinkResponse.body).toMatchObject({
      empresaId: null,
      statusVinculo: 'IGNORADA'
    });

    const linkedOnly = await requestJson('/integracoes/acessorias/empresas/vinculos', {
      cookie: sessionCookie
    });

    expect(linkedOnly.response.status).toBe(200);
    expect((linkedOnly.body as Array<{ empresaId: string | null }>)).toHaveLength(1);
  }, TEST_TIMEOUT);

  test('executa o loop por empresa, atualiza status e permite reprocessamento manual', async () => {
    const empresaLoop = await prisma.empresa.create({
      data: {
        cnpj: '55555555000101',
        naCarteira: true,
        nomeFantasia: 'Empresa Loop ECAC',
        pendenciaOperacional: false,
        razaoSocial: 'Empresa Loop ECAC Ltda',
        regimeTributario: RegimeTributario.SIMPLES_NACIONAL,
        responsavelInternoId: null,
        statusAcesso: StatusAcessoEmpresa.NAO_VERIFICADO,
        statusProcuracao: StatusProcuracaoEmpresa.NAO_VERIFICADA
      }
    });

    externalCompaniesPayload = [
      {
        cnpj: '55555555000101',
        id: 'ext-loop-1',
        razaoSocial: 'Empresa Externa Loop Ltda'
      }
    ];
    expectedToken = VALID_TOKEN;
    await requestJson('/integracoes/acessorias/config', {
      body: { apiToken: VALID_TOKEN },
      cookie: sessionCookie,
      method: 'PATCH'
    });

    await requestJson('/integracoes/acessorias/empresas/sync', {
      cookie: sessionCookie,
      method: 'POST'
    });

    const firstExecution = await requestJson(
      `/integracoes/acessorias/empresas/${empresaLoop.id}/execute`,
      {
        cookie: sessionCookie,
        method: 'POST'
      }
    );

    expect(firstExecution.response.status).toBe(200);
    expect(firstExecution.body).toMatchObject({
      success: true,
      integration: {
        statusIntegracao: 'ATIVA'
      },
      varredura: {
        statusExecucao: 'CONCLUIDA',
        tipoVarredura: 'ACESSORIAS'
      }
    });

    const secondExecution = await requestJson(
      `/integracoes/acessorias/empresas/${empresaLoop.id}/execute`,
      {
        cookie: sessionCookie,
        method: 'POST'
      }
    );

    expect(secondExecution.response.status).toBe(200);
    expect(secondExecution.body).toMatchObject({
      success: true,
      integration: {
        statusIntegracao: 'ATIVA'
      },
      varredura: {
        statusExecucao: 'CONCLUIDA',
        tipoVarredura: 'ACESSORIAS'
      }
    });

    const varreduras = await prisma.varredura.findMany({
      orderBy: {
        iniciadoEm: 'asc'
      },
      where: {
        empresaId: empresaLoop.id,
        tipoVarredura: 'ACESSORIAS'
      }
    });

    expect(varreduras).toHaveLength(2);

    const logs = await prisma.logExecucao.findMany({
      orderBy: {
        executadoEm: 'asc'
      },
      where: {
        empresaId: empresaLoop.id
      }
    });

    expect(logs).toHaveLength(2);
    expect(logs.every((log) => log.tipo === 'REVISAO_OPERACIONAL')).toBe(true);

    const pendencias = await prisma.pendencia.findMany({
      where: {
        empresaId: empresaLoop.id
      }
    });

    expect(pendencias).toHaveLength(0);
  }, TEST_TIMEOUT);

  test('mantem o ultimo sucesso quando o retorno externo fica inconclusivo e marca necessita conferencia', async () => {
    const empresaConfiavel = await prisma.empresa.create({
      data: {
        cnpj: '77777777000103',
        naCarteira: true,
        nomeFantasia: 'Empresa Confiavel ECAC',
        pendenciaOperacional: false,
        razaoSocial: 'Empresa Confiavel ECAC Ltda',
        regimeTributario: RegimeTributario.SIMPLES_NACIONAL,
        responsavelInternoId: null,
        statusAcesso: StatusAcessoEmpresa.NAO_VERIFICADO,
        statusProcuracao: StatusProcuracaoEmpresa.NAO_VERIFICADA
      }
    });

    externalCompaniesPayload = [
      {
        cnpj: '77777777000103',
        id: 'ext-confiavel-1',
        razaoSocial: 'Empresa Externa Confiavel Ltda'
      }
    ];
    expectedToken = VALID_TOKEN;
    await requestJson('/integracoes/acessorias/config', {
      body: { apiToken: VALID_TOKEN },
      cookie: sessionCookie,
      method: 'PATCH'
    });

    await requestJson('/integracoes/acessorias/empresas/sync', {
      cookie: sessionCookie,
      method: 'POST'
    });

    const successfulExecution = await requestJson(
      `/integracoes/acessorias/empresas/${empresaConfiavel.id}/execute`,
      {
        cookie: sessionCookie,
        method: 'POST'
      }
    );

    expect(successfulExecution.response.status).toBe(200);
    expect(successfulExecution.body).toMatchObject({
      success: true,
      integration: {
        statusIntegracao: 'ATIVA'
      }
    });

    const ultimoSucessoEm = String(
      (successfulExecution.body as {
        integration?: { ultimoSucessoEm?: string | null };
      }).integration?.ultimoSucessoEm ?? ''
    );

    externalCompaniesPayload = [
      {
        id: 'ext-confiavel-1',
        razaoSocial: 'Empresa Externa Confiavel Ltda'
      }
    ];

    const inconclusiveExecution = await requestJson(
      `/integracoes/acessorias/empresas/${empresaConfiavel.id}/execute`,
      {
        cookie: sessionCookie,
        method: 'POST'
      }
    );

    expect(inconclusiveExecution.response.status).toBe(200);
    expect(inconclusiveExecution.body).toMatchObject({
      success: false,
      integration: {
        statusIntegracao: 'NECESSITA_CONFERENCIA',
        ultimoSucessoEm
      },
      varredura: {
        statusExecucao: 'FALHA',
        tipoVarredura: 'ACESSORIAS'
      }
    });
    expect(
      String((inconclusiveExecution.body as { message?: string }).message ?? '')
    ).toContain('inconclusivo');

    const integration = await prisma.integracaoEmpresa.findFirstOrThrow({
      orderBy: {
        updatedAt: 'desc'
      },
      where: {
        empresaId: empresaConfiavel.id,
        tipoIntegracao: 'API'
      }
    });

    const pendencias = await prisma.pendencia.findMany({
      where: {
        empresaId: empresaConfiavel.id,
        origem: 'ACESSORIAS_EXECUCAO_EMPRESA'
      }
    });

    expect(integration.statusIntegracao).toBe('NECESSITA_CONFERENCIA');
    expect(integration.ultimoSucessoEm?.toISOString()).toBe(ultimoSucessoEm);
    expect(integration.ultimoErroEm).not.toBeNull();
    expect(integration.ultimaExecucaoEm).not.toBeNull();
    expect(pendencias).toHaveLength(1);
  }, TEST_TIMEOUT);

  test('falha transitória de conexao continua rastreavel sem abrir pendencia automatica', async () => {
    const empresaConexao = await prisma.empresa.create({
      data: {
        cnpj: '88888888000184',
        naCarteira: true,
        nomeFantasia: 'Empresa Conexao ECAC',
        pendenciaOperacional: false,
        razaoSocial: 'Empresa Conexao ECAC Ltda',
        regimeTributario: RegimeTributario.SIMPLES_NACIONAL,
        responsavelInternoId: null,
        statusAcesso: StatusAcessoEmpresa.NAO_VERIFICADO,
        statusProcuracao: StatusProcuracaoEmpresa.NAO_VERIFICADA
      }
    });

    externalCompaniesPayload = [
      {
        cnpj: '88888888000184',
        id: 'ext-conexao-1',
        razaoSocial: 'Empresa Externa Conexao Ltda'
      }
    ];
    expectedToken = VALID_TOKEN;
    await requestJson('/integracoes/acessorias/config', {
      body: { apiToken: VALID_TOKEN },
      cookie: sessionCookie,
      method: 'PATCH'
    });

    await requestJson('/integracoes/acessorias/empresas/sync', {
      cookie: sessionCookie,
      method: 'POST'
    });

    const successfulExecution = await requestJson(
      `/integracoes/acessorias/empresas/${empresaConexao.id}/execute`,
      {
        cookie: sessionCookie,
        method: 'POST'
      }
    );

    const ultimoSucessoEm = String(
      (successfulExecution.body as {
        integration?: { ultimoSucessoEm?: string | null };
      }).integration?.ultimoSucessoEm ?? ''
    );

    const originalCompaniesUrl = process.env.ACESSORIAS_EMPRESAS_URL;

    try {
      process.env.ACESSORIAS_EMPRESAS_URL = 'http://127.0.0.1:1/companies';

      const failedExecution = await requestJson(
        `/integracoes/acessorias/empresas/${empresaConexao.id}/execute`,
        {
          cookie: sessionCookie,
          method: 'POST'
        }
      );

      expect(failedExecution.response.status).toBe(200);
      expect(failedExecution.body).toMatchObject({
        success: false,
        integration: {
          statusIntegracao: 'NECESSITA_CONFERENCIA',
          ultimoSucessoEm
        },
        varredura: {
          statusExecucao: 'FALHA',
          tipoVarredura: 'ACESSORIAS'
        }
      });

      const [integration, pendencias, eventos] = await Promise.all([
        prisma.integracaoEmpresa.findFirstOrThrow({
          orderBy: {
            updatedAt: 'desc'
          },
          where: {
            empresaId: empresaConexao.id,
            tipoIntegracao: 'API'
          }
        }),
        prisma.pendencia.findMany({
          where: {
            empresaId: empresaConexao.id,
            origem: 'ACESSORIAS_EXECUCAO_EMPRESA'
          }
        }),
        prisma.eventoOperacional.findMany({
          where: {
            empresaId: empresaConexao.id
          }
        })
      ]);

      expect(integration.statusIntegracao).toBe('NECESSITA_CONFERENCIA');
      expect(integration.ultimoSucessoEm?.toISOString()).toBe(ultimoSucessoEm);
      expect(integration.ultimoErroEm).not.toBeNull();
      expect(pendencias).toHaveLength(0);
      expect(eventos.length).toBeGreaterThanOrEqual(1);
    } finally {
      process.env.ACESSORIAS_EMPRESAS_URL = originalCompaniesUrl;
    }
  }, TEST_TIMEOUT);

  test('gera falha rastreavel, evento e pendencia quando a empresa nao possui vinculo valido', async () => {
    const empresaSemVinculo = await prisma.empresa.create({
      data: {
        cnpj: '66666666000102',
        naCarteira: true,
        nomeFantasia: 'Empresa Sem Vinculo',
        pendenciaOperacional: false,
        razaoSocial: 'Empresa Sem Vinculo ECAC Ltda',
        regimeTributario: RegimeTributario.SIMPLES_NACIONAL,
        responsavelInternoId: null,
        statusAcesso: StatusAcessoEmpresa.NAO_VERIFICADO,
        statusProcuracao: StatusProcuracaoEmpresa.NAO_VERIFICADA
      }
    });

    externalCompaniesPayload = [
      {
        cnpj: '77777777000103',
        id: 'ext-other-1',
        razaoSocial: 'Empresa Externa Diferente Ltda'
      }
    ];
    expectedToken = VALID_TOKEN;
    await requestJson('/integracoes/acessorias/config', {
      body: { apiToken: VALID_TOKEN },
      cookie: sessionCookie,
      method: 'PATCH'
    });

    const failedExecution = await requestJson(
      `/integracoes/acessorias/empresas/${empresaSemVinculo.id}/execute`,
      {
        cookie: sessionCookie,
        method: 'POST'
      }
    );

    expect(failedExecution.response.status).toBe(200);
    expect(failedExecution.body).toMatchObject({
      success: false,
      integration: {
        statusIntegracao: 'ERRO'
      },
      varredura: {
        statusExecucao: 'FALHA',
        tipoVarredura: 'ACESSORIAS'
      }
    });
    expect(String((failedExecution.body as { message?: string }).message ?? '')).toContain(
      'vinculo'
    );

    const varredura = await prisma.varredura.findFirstOrThrow({
      orderBy: {
        createdAt: 'desc'
      },
      where: {
        empresaId: empresaSemVinculo.id,
        tipoVarredura: 'ACESSORIAS'
      }
    });

    const evento = await prisma.eventoOperacional.findFirstOrThrow({
      where: {
        empresaId: empresaSemVinculo.id,
        varreduraId: varredura.id
      }
    });

    const pendencia = await prisma.pendencia.findFirstOrThrow({
      where: {
        empresaId: empresaSemVinculo.id,
        origem: 'ACESSORIAS_EXECUCAO_EMPRESA'
      }
    });

    const integration = await prisma.integracaoEmpresa.findFirstOrThrow({
      orderBy: {
        updatedAt: 'desc'
      },
      where: {
        empresaId: empresaSemVinculo.id,
        tipoIntegracao: 'API'
      }
    });

    expect(evento.varreduraId).toBe(varredura.id);
    expect(pendencia.status).toBe('ABERTA');
    expect(pendencia.tipo).toBe('OPERACIONAL');
    expect(integration.statusIntegracao).toBe('ERRO');
    expect(integration.mensagemErroAtual).toContain('vinculo');
    expect(integration.ultimoErroEm).not.toBeNull();
    expect(varredura.resumoResultado).toContain('Empresa nao possui vinculo');
  }, TEST_TIMEOUT);

  test('lista jobs recentes em ordem decrescente', async () => {
    const response = await requestJson('/integracoes/acessorias/jobs?take=10', {
      cookie: sessionCookie
    });

    expect(response.response.status).toBe(200);
    const items = response.body as Array<{ status: string; tipoJob: string }>;

    expect(items.length).toBeGreaterThanOrEqual(3);
    expect(items[0]?.tipoJob).toBe('SINCRONIZACAO_EMPRESAS');
    expect(items.some((item) => item.tipoJob === 'TESTE_CONEXAO')).toBe(true);
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
  rmSync(path.join(API_ROOT, 'tsconfig.build.tsbuildinfo'), { force: true });

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
