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
const OPERATIONAL_CHECK_BLOCKED_MESSAGE =
  'Nao e possivel registrar conferencia operacional enquanto houver pendencia operacional aberta.';
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
  responsavelId: string;
  empresaRegularizeId: string;
  empresaRemoveId: string;
  pendenciaRegularizeId: string;
};

let postgres: EmbeddedPostgres;
let prisma: PrismaClient;
let app: INestApplication | undefined;
let baseUrl = '';
let sessionCookie = '';
let adminUserId = '';
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
  adminUserId = await loadAdminUserId(prisma);

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
      empresaId: seededData.empresaCreateId,
      empresa: {
        empresaId: seededData.empresaCreateId,
        pendenciaOperacional: true
      }
    });
    expect(
      (historyResponse.body as { logs: unknown[]; pendencias: unknown[] }).logs
    ).toHaveLength(1);
    expect(
      (historyResponse.body as { logs: unknown[]; pendencias: unknown[] })
        .pendencias
    ).toHaveLength(1);
    expect(
      (
        historyResponse.body as {
          pendenciasAbertas: unknown[];
          pendenciasEncerradasRecentes: unknown[];
          ultimoLog: unknown;
        }
      ).pendenciasAbertas
    ).toHaveLength(1);
    expect(
      (
        historyResponse.body as {
          pendenciasAbertas: unknown[];
          pendenciasEncerradasRecentes: unknown[];
          ultimoLog: unknown;
        }
      ).pendenciasEncerradasRecentes
    ).toHaveLength(0);
    expect(
      (
        historyResponse.body as {
          pendenciasAbertas: unknown[];
          pendenciasEncerradasRecentes: unknown[];
          ultimoLog: { pendenciaId: string | null; tipo: TipoLogExecucao } | null;
        }
      ).ultimoLog
    ).toMatchObject({
      pendenciaId: pendencia.id,
      tipo: TipoLogExecucao.REGISTRO_PENDENCIA
    });
  }, TEST_TIMEOUT);

  test('operational-history consolida snapshot, pendencias abertas, encerradas recentes e ultimo log', async () => {
    const empresa = await prisma.empresa.create({
      data: {
        cnpj: '55555555000135',
        naCarteira: true,
        nomeFantasia: 'Empresa Dossie',
        observacoesOperacionais: 'Contato feito. Aguardando retorno do cliente.',
        pendenciaOperacional: true,
        razaoSocial: 'Empresa Dossie Operacional Ltda',
        regularizadaEm: new Date('2026-04-11T09:30:00.000Z'),
        regimeTributario: RegimeTributario.SIMPLES_NACIONAL,
        responsavelInternoId: seededData.responsavelId,
        statusAcesso: StatusAcessoEmpresa.BLOQUEADO,
        statusProcuracao: StatusProcuracaoEmpresa.PENDENTE,
        ultimaConferenciaOperacionalEm: new Date('2026-04-12T08:00:00.000Z')
      }
    });

    const pendenciaAberta = await prisma.pendencia.create({
      data: {
        abertaEm: new Date('2026-04-12T10:00:00.000Z'),
        descricao: 'Pendencia aberta no dossie operacional.',
        empresaId: empresa.id,
        origem: 'MANUAL',
        prioridade: PrioridadePendencia.ALTA,
        responsavelInternoId: seededData.responsavelId,
        status: StatusPendencia.ABERTA,
        tipo: TipoPendencia.OPERACIONAL,
        titulo: 'Pendencia operacional aberta'
      }
    });

    const pendenciaResolvida = await prisma.pendencia.create({
      data: {
        abertaEm: new Date('2026-04-10T10:00:00.000Z'),
        descricao: 'Pendencia resolvida no dossie operacional.',
        empresaId: empresa.id,
        fechadaEm: new Date('2026-04-12T16:00:00.000Z'),
        origem: 'MANUAL',
        prioridade: PrioridadePendencia.MEDIA,
        responsavelInternoId: seededData.responsavelId,
        status: StatusPendencia.RESOLVIDA,
        tipo: TipoPendencia.ACESSO,
        titulo: 'Pendencia de acesso resolvida'
      }
    });

    await prisma.logExecucao.create({
      data: {
        detalhes: 'Conferencia operacional registrada no dossie.',
        empresaId: empresa.id,
        executadoEm: new Date('2026-04-12T11:00:00.000Z'),
        pendenciaId: pendenciaAberta.id,
        resultado: ResultadoLogExecucao.SUCESSO,
        resumo: 'Conferencia operacional registrada.',
        tipo: TipoLogExecucao.CONFERENCIA_OPERACIONAL
      }
    });

    await prisma.logExecucao.create({
      data: {
        detalhes: 'Pendencia de acesso resolvida no fluxo consolidado.',
        empresaId: empresa.id,
        executadoEm: new Date('2026-04-12T17:00:00.000Z'),
        pendenciaId: pendenciaResolvida.id,
        resultado: ResultadoLogExecucao.SUCESSO,
        resumo: 'Pendencia regularizada: Pendencia de acesso resolvida',
        tipo: TipoLogExecucao.REGULARIZACAO_PENDENCIA
      }
    });

    const response = await requestJson(
      `/companies/${empresa.id}/operational-history?take=5`,
      {
        cookie: sessionCookie
      }
    );

    expect(response.response.status).toBe(200);
    expect(response.body).toMatchObject({
      empresaId: empresa.id,
      empresaNome: empresa.razaoSocial,
      empresa: {
        empresaId: empresa.id,
        empresaNome: empresa.razaoSocial,
        observacoesOperacionais:
          'Contato feito. Aguardando retorno do cliente.',
        pendenciaOperacional: true,
        regularizadaEm: '2026-04-11T09:30:00.000Z',
        responsavelInternoId: seededData.responsavelId,
        statusAcesso: StatusAcessoEmpresa.BLOQUEADO,
        statusProcuracao: StatusProcuracaoEmpresa.PENDENTE,
        ultimaConferenciaOperacionalEm: '2026-04-12T08:00:00.000Z'
      }
    });

    const history = response.body as {
      logs: Array<{ id: string; resumo: string }>;
      pendenciasAbertas: Array<{ id: string; status: StatusPendencia }>;
      pendenciasEncerradasRecentes: Array<{
        fechadaEm: string | null;
        id: string;
        status: StatusPendencia;
      }>;
      ultimoLog: { id: string; resumo: string } | null;
    };

    expect(history.logs).toHaveLength(2);
    expect(history.pendenciasAbertas).toEqual([
      expect.objectContaining({
        id: pendenciaAberta.id,
        status: StatusPendencia.ABERTA
      })
    ]);
    expect(history.pendenciasEncerradasRecentes).toEqual([
      expect.objectContaining({
        fechadaEm: '2026-04-12T16:00:00.000Z',
        id: pendenciaResolvida.id,
        status: StatusPendencia.RESOLVIDA
      })
    ]);
    expect(history.ultimoLog).toMatchObject({
      resumo: 'Pendencia regularizada: Pendencia de acesso resolvida'
    });
  }, TEST_TIMEOUT);

  test('edicao manual da empresa registra LogExecucao legivel e atualiza o dossie operacional', async () => {
    const empresa = await prisma.empresa.create({
      data: {
        cnpj: '66666666000116',
        certificadoDigitalImplementadoEm: new Date(
          '2026-04-10T09:00:00.000Z'
        ),
        certificadoDigitalValidoAte: new Date('2026-05-20T09:00:00.000Z'),
        naCarteira: true,
        nomeFantasia: 'Empresa Edicao Manual',
        pendenciaOperacional: false,
        procuracaoImplementadaEm: new Date('2026-04-02T09:00:00.000Z'),
        procuracaoValidaAte: new Date('2026-04-20T09:00:00.000Z'),
        razaoSocial: 'Empresa Edicao Manual Ltda',
        regimeTributario: RegimeTributario.SIMPLES_NACIONAL,
        responsavelInternoId: seededData.responsavelId,
        statusAcesso: StatusAcessoEmpresa.NAO_VERIFICADO,
        statusProcuracao: StatusProcuracaoEmpresa.NAO_VERIFICADA
      }
    });

    const initialResponse = await requestJson(`/companies/${empresa.id}`, {
      cookie: sessionCookie
    });

    expect(initialResponse.response.status).toBe(200);
    expect(initialResponse.body).toMatchObject({
      certificadoDigitalImplementadoEm: '2026-04-10T09:00:00.000Z',
      certificadoDigitalValidoAte: '2026-05-20T09:00:00.000Z',
      procuracaoImplementadaEm: '2026-04-02T09:00:00.000Z',
      procuracaoValidaAte: '2026-04-20T09:00:00.000Z'
    });

    const response = await requestJson(`/companies/${empresa.id}`, {
      body: {
        certificadoDigitalImplementadoEm: '2026-04-11T10:00:00.000Z',
        certificadoDigitalValidoAte: '2026-05-31T10:00:00.000Z',
        nomeFantasia: 'Empresa Edicao Manual Revisada',
        observacoesOperacionais:
          'Cliente avisado. Aguardando regularizacao do acesso.',
        pendenciaOperacional: true,
        procuracaoImplementadaEm: '2026-04-12T10:00:00.000Z',
        procuracaoValidaAte: '2026-04-28T10:00:00.000Z',
        statusAcesso: StatusAcessoEmpresa.BLOQUEADO,
        statusProcuracao: StatusProcuracaoEmpresa.PENDENTE,
        ultimaConferenciaOperacionalEm: '2026-04-13T11:00:00.000Z'
      },
      cookie: sessionCookie,
      method: 'PATCH'
    });

    expect(response.response.status).toBe(200);
    expect(response.body).toMatchObject({
      id: empresa.id,
      nomeFantasia: 'Empresa Edicao Manual Revisada',
      observacoesOperacionais:
        'Cliente avisado. Aguardando regularizacao do acesso.',
      pendenciaOperacional: true,
      certificadoDigitalImplementadoEm: '2026-04-11T10:00:00.000Z',
      certificadoDigitalValidoAte: '2026-05-31T10:00:00.000Z',
      procuracaoImplementadaEm: '2026-04-12T10:00:00.000Z',
      procuracaoValidaAte: '2026-04-28T10:00:00.000Z',
      statusAcesso: StatusAcessoEmpresa.BLOQUEADO,
      statusProcuracao: StatusProcuracaoEmpresa.PENDENTE,
      ultimaConferenciaOperacionalEm: '2026-04-13T11:00:00.000Z'
    });

    const persisted = await prisma.empresa.findUnique({
      select: {
        certificadoDigitalImplementadoEm: true,
        certificadoDigitalValidoAte: true,
        nomeFantasia: true,
        observacoesOperacionais: true,
        pendenciaOperacional: true,
        procuracaoImplementadaEm: true,
        procuracaoValidaAte: true,
        statusAcesso: true,
        statusProcuracao: true,
        ultimaConferenciaOperacionalEm: true
      },
      where: {
        id: empresa.id
      }
    });

    expect(persisted).toMatchObject({
      nomeFantasia: 'Empresa Edicao Manual Revisada',
      observacoesOperacionais:
        'Cliente avisado. Aguardando regularizacao do acesso.',
      pendenciaOperacional: true,
      statusAcesso: StatusAcessoEmpresa.BLOQUEADO,
      statusProcuracao: StatusProcuracaoEmpresa.PENDENTE
    });
    expect(
      persisted?.certificadoDigitalImplementadoEm?.toISOString()
    ).toBe('2026-04-11T10:00:00.000Z');
    expect(persisted?.certificadoDigitalValidoAte?.toISOString()).toBe(
      '2026-05-31T10:00:00.000Z'
    );
    expect(persisted?.procuracaoImplementadaEm?.toISOString()).toBe(
      '2026-04-12T10:00:00.000Z'
    );
    expect(persisted?.procuracaoValidaAte?.toISOString()).toBe(
      '2026-04-28T10:00:00.000Z'
    );
    expect(
      persisted?.ultimaConferenciaOperacionalEm?.toISOString()
    ).toBe('2026-04-13T11:00:00.000Z');

    expect(response.body).toMatchObject({
      certificadoDigitalImplementadoEm: '2026-04-11T10:00:00.000Z',
      certificadoDigitalValidoAte: '2026-05-31T10:00:00.000Z',
      procuracaoImplementadaEm: '2026-04-12T10:00:00.000Z',
      procuracaoValidaAte: '2026-04-28T10:00:00.000Z'
    });

    const logs = await prisma.logExecucao.findMany({
      include: {
        executadoPorUsuarioInterno: {
          select: {
            nome: true
          }
        }
      },
      orderBy: {
        executadoEm: 'desc'
      },
      where: {
        empresaId: empresa.id
      }
    });

    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      empresaId: empresa.id,
      executadoPorUsuarioInternoId: adminUserId,
      resultado: ResultadoLogExecucao.SUCESSO,
      resumo: 'Edicao manual da empresa registrada.',
      tipo: TipoLogExecucao.EDICAO_MANUAL_EMPRESA
    });
    expect(logs[0]?.executadoPorUsuarioInterno?.nome).toBe('Admin ECAC');
    expect(logs[0]?.detalhes).toContain(
      'Status de acesso alterado de NAO_VERIFICADO para BLOQUEADO.'
    );
    expect(logs[0]?.detalhes).toContain(
      'Status de procuracao alterado de NAO_VERIFICADA para PENDENTE.'
    );
    expect(logs[0]?.detalhes).toContain(
      'Pendencia operacional alterada de nao para sim.'
    );
    expect(logs[0]?.detalhes).toContain(
      'Certificado digital implementado em alterado de 2026-04-10T09:00:00.000Z para 2026-04-11T10:00:00.000Z.'
    );
    expect(logs[0]?.detalhes).toContain(
      'Certificado digital valido ate alterado de 2026-05-20T09:00:00.000Z para 2026-05-31T10:00:00.000Z.'
    );
    expect(logs[0]?.detalhes).toContain(
      'Procuracao implementada em alterada de 2026-04-02T09:00:00.000Z para 2026-04-12T10:00:00.000Z.'
    );
    expect(logs[0]?.detalhes).toContain(
      'Procuracao valida ate alterada de 2026-04-20T09:00:00.000Z para 2026-04-28T10:00:00.000Z.'
    );
    expect(logs[0]?.detalhes).toContain(
      'Observacoes operacionais atualizadas.'
    );

    const historyResponse = await requestJson(
      `/companies/${empresa.id}/operational-history`,
      {
        cookie: sessionCookie
      }
    );

    expect(historyResponse.response.status).toBe(200);
    expect(historyResponse.body).toMatchObject({
      empresaId: empresa.id,
      ultimoLog: {
        executadoPorUsuarioInternoId: adminUserId,
        tipo: TipoLogExecucao.EDICAO_MANUAL_EMPRESA
      }
    });
    expect(
      (historyResponse.body as { logs: Array<{ tipo: string }> }).logs[0]?.tipo
    ).toBe(TipoLogExecucao.EDICAO_MANUAL_EMPRESA);

    const noChangeResponse = await requestJson(`/companies/${empresa.id}`, {
      body: {
        nomeFantasia: 'Empresa Edicao Manual Revisada',
        observacoesOperacionais:
          'Cliente avisado. Aguardando regularizacao do acesso.',
        pendenciaOperacional: true,
        statusAcesso: StatusAcessoEmpresa.BLOQUEADO,
        statusProcuracao: StatusProcuracaoEmpresa.PENDENTE,
        ultimaConferenciaOperacionalEm: '2026-04-13T11:00:00.000Z'
      },
      cookie: sessionCookie,
      method: 'PATCH'
    });

    expect(noChangeResponse.response.status).toBe(200);

    const logsAfterNoChange = await prisma.logExecucao.findMany({
      where: {
        empresaId: empresa.id
      }
    });

    expect(logsAfterNoChange).toHaveLength(1);
  }, TEST_TIMEOUT);

  test('edicao manual aceita vigencias vazias sem gerar log extra', async () => {
    const empresa = await prisma.empresa.create({
      data: {
        cnpj: '66666666000117',
        naCarteira: true,
        nomeFantasia: 'Empresa Edicao Manual Vazia',
        pendenciaOperacional: false,
        razaoSocial: 'Empresa Edicao Manual Vazia Ltda',
        regimeTributario: RegimeTributario.SIMPLES_NACIONAL,
        responsavelInternoId: seededData.responsavelId,
        statusAcesso: StatusAcessoEmpresa.NAO_VERIFICADO,
        statusProcuracao: StatusProcuracaoEmpresa.NAO_VERIFICADA
      }
    });

    const response = await requestJson(`/companies/${empresa.id}`, {
      body: {
        certificadoDigitalImplementadoEm: null,
        certificadoDigitalValidoAte: null,
        procuracaoImplementadaEm: null,
        procuracaoValidaAte: null
      },
      cookie: sessionCookie,
      method: 'PATCH'
    });

    expect(response.response.status).toBe(200);
    expect(response.body).toMatchObject({
      certificadoDigitalImplementadoEm: null,
      certificadoDigitalValidoAte: null,
      procuracaoImplementadaEm: null,
      procuracaoValidaAte: null
    });

    const logs = await prisma.logExecucao.findMany({
      where: {
        empresaId: empresa.id
      }
    });

    expect(logs).toHaveLength(0);
  }, TEST_TIMEOUT);

  test('edicao manual de empresa importada sem responsavel interno gera trilha legivel', async () => {
    const empresa = await prisma.empresa.create({
      data: {
        cnpj: '77777777000106',
        naCarteira: true,
        nomeFantasia: 'Empresa Importada Sem Responsavel',
        pendenciaOperacional: false,
        razaoSocial: 'Empresa Importada Sem Responsavel Ltda',
        regimeTributario: RegimeTributario.SIMPLES_NACIONAL,
        responsavelInternoId: null,
        statusAcesso: StatusAcessoEmpresa.NAO_VERIFICADO,
        statusProcuracao: StatusProcuracaoEmpresa.NAO_VERIFICADA
      }
    });

    const response = await requestJson(`/companies/${empresa.id}`, {
      body: {
        observacoesOperacionais: 'Carteira importada sem responsavel interno.',
        responsavelInternoId: seededData.responsavelId,
        statusAcesso: StatusAcessoEmpresa.DISPONIVEL,
        statusProcuracao: StatusProcuracaoEmpresa.VALIDA
      },
      cookie: sessionCookie,
      method: 'PATCH'
    });

    expect(response.response.status).toBe(200);

    const logs = await prisma.logExecucao.findMany({
      include: {
        executadoPorUsuarioInterno: {
          select: {
            nome: true
          }
        }
      },
      orderBy: {
        executadoEm: 'desc'
      },
      where: {
        empresaId: empresa.id
      }
    });

    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      empresaId: empresa.id,
      executadoPorUsuarioInternoId: adminUserId,
      resultado: ResultadoLogExecucao.SUCESSO,
      tipo: TipoLogExecucao.EDICAO_MANUAL_EMPRESA
    });
    expect(logs[0]?.executadoPorUsuarioInterno?.nome).toBe('Admin ECAC');
    expect(logs[0]?.detalhes).toContain(
      'Responsavel interno alterado de Sem responsavel para Responsavel Traceabilidade.'
    );
    expect(logs[0]?.detalhes).toContain(
      'Status de acesso alterado de NAO_VERIFICADO para DISPONIVEL.'
    );
    expect(logs[0]?.detalhes).toContain(
      'Status de procuracao alterado de NAO_VERIFICADA para VALIDA.'
    );
    expect(logs[0]?.detalhes).toContain(
      'Observacoes operacionais atualizadas.'
    );

    const historyResponse = await requestJson(
      `/companies/${empresa.id}/operational-history`,
      {
        cookie: sessionCookie
      }
    );

    expect(historyResponse.response.status).toBe(200);
    expect(historyResponse.body).toMatchObject({
      empresaId: empresa.id,
      ultimoLog: {
        executadoPorUsuarioInternoId: adminUserId,
        tipo: TipoLogExecucao.EDICAO_MANUAL_EMPRESA
      }
    });
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

  test('conferir agora e bloqueada quando a empresa possui pendencia operacional aberta', async () => {
    const empresa = await prisma.empresa.create({
      data: {
        cnpj: '55555555000145',
        naCarteira: true,
        nomeFantasia: 'Empresa Conferencia Bloqueada',
        pendenciaOperacional: true,
        razaoSocial: 'Empresa Conferencia Bloqueada Ltda',
        regimeTributario: RegimeTributario.SIMPLES_NACIONAL,
        responsavelInternoId: seededData.responsavelId,
        statusAcesso: StatusAcessoEmpresa.BLOQUEADO,
        statusProcuracao: StatusProcuracaoEmpresa.PENDENTE,
        ultimaConferenciaOperacionalEm: new Date(
          '2026-04-13T08:00:00.000Z'
        )
      }
    });

    await prisma.pendencia.create({
      data: {
        abertaEm: new Date('2026-04-13T07:00:00.000Z'),
        descricao: 'Pendencia operacional aberta para bloqueio da conferencia.',
        empresaId: empresa.id,
        origem: 'MANUAL',
        prioridade: PrioridadePendencia.ALTA,
        responsavelInternoId: seededData.responsavelId,
        status: StatusPendencia.ABERTA,
        tipo: TipoPendencia.OPERACIONAL,
        titulo: 'Pendencia operacional bloqueante'
      }
    });

    const response = await requestJson(
      `/companies/${empresa.id}/operational/check`,
      {
        body: {
          chaveIdempotencia: 'company-check-blocked'
        },
        cookie: sessionCookie,
        method: 'POST'
      }
    );

    expect(response.response.status).toBe(409);
    expect(response.body).toMatchObject({
      error: 'Conflict',
      message: OPERATIONAL_CHECK_BLOCKED_MESSAGE,
      statusCode: 409
    });

    const persisted = await prisma.empresa.findUnique({
      select: {
        pendenciaOperacional: true,
        ultimaConferenciaOperacionalEm: true
      },
      where: {
        id: empresa.id
      }
    });

    expect(persisted).toMatchObject({
      pendenciaOperacional: true
    });
    expect(
      persisted?.ultimaConferenciaOperacionalEm?.toISOString()
    ).toBe('2026-04-13T08:00:00.000Z');

    const logs = await prisma.logExecucao.findMany({
      where: {
        empresaId: empresa.id,
        tipo: TipoLogExecucao.CONFERENCIA_OPERACIONAL
      }
    });

    expect(logs).toHaveLength(0);

    const historyResponse = await requestJson(
      `/companies/${empresa.id}/operational-history`,
      {
        cookie: sessionCookie
      }
    );

    expect(historyResponse.response.status).toBe(200);
    expect(historyResponse.body).toMatchObject({
      empresaId: empresa.id,
      empresa: {
        empresaId: empresa.id,
        pendenciaOperacional: true
      }
    });
    expect(
      (historyResponse.body as { logs: unknown[] }).logs
    ).toHaveLength(0);
  }, TEST_TIMEOUT);

  test('revisao operacional registra LogExecucao sem encerrar pendencia aberta', async () => {
    const empresa = await prisma.empresa.create({
      data: {
        cnpj: '55555555000146',
        naCarteira: true,
        nomeFantasia: 'Empresa Revisao Operacional',
        pendenciaOperacional: true,
        razaoSocial: 'Empresa Revisao Operacional Ltda',
        regimeTributario: RegimeTributario.SIMPLES_NACIONAL,
        responsavelInternoId: seededData.responsavelId,
        statusAcesso: StatusAcessoEmpresa.BLOQUEADO,
        statusProcuracao: StatusProcuracaoEmpresa.PENDENTE,
        ultimaConferenciaOperacionalEm: new Date(
          '2026-04-13T08:00:00.000Z'
        )
      }
    });

    const pendencia = await prisma.pendencia.create({
      data: {
        abertaEm: new Date('2026-04-13T07:00:00.000Z'),
        descricao: 'Pendencia operacional aberta para revisao.',
        empresaId: empresa.id,
        origem: 'MANUAL',
        prioridade: PrioridadePendencia.ALTA,
        responsavelInternoId: seededData.responsavelId,
        status: StatusPendencia.ABERTA,
        tipo: TipoPendencia.OPERACIONAL,
        titulo: 'Pendencia operacional em revisao'
      }
    });

    const response = await requestJson(
      `/companies/${empresa.id}/operational/review`,
      {
        body: {
          chaveIdempotencia: 'company-review'
        },
        cookie: sessionCookie,
        method: 'POST'
      }
    );

    expect(response.response.status).toBe(201);
    expect(response.body).toMatchObject({
      updatedAt: expect.any(String)
    });

    const persisted = await prisma.empresa.findUnique({
      select: {
        pendenciaOperacional: true,
        regularizadaEm: true,
        ultimaConferenciaOperacionalEm: true
      },
      where: {
        id: empresa.id
      }
    });

    expect(persisted).toMatchObject({
      pendenciaOperacional: true,
      regularizadaEm: null
    });
    expect(
      persisted?.ultimaConferenciaOperacionalEm?.toISOString()
    ).toBe('2026-04-13T08:00:00.000Z');

    const pendenciaPersistida = await prisma.pendencia.findUnique({
      where: {
        id: pendencia.id
      }
    });

    expect(pendenciaPersistida).toMatchObject({
      status: StatusPendencia.ABERTA
    });
    expect(pendenciaPersistida?.fechadaEm).toBeNull();

    const logs = await prisma.logExecucao.findMany({
      orderBy: {
        executadoEm: 'desc'
      },
      where: {
        empresaId: empresa.id,
        tipo: TipoLogExecucao.REVISAO_OPERACIONAL
      }
    });

    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      resultado: ResultadoLogExecucao.SUCESSO,
      resumo: 'Revisao operacional registrada.',
      tipo: TipoLogExecucao.REVISAO_OPERACIONAL
    });
    expect(logs[0]?.detalhes).toContain(
      'Nova revisao operacional registrada sem alterar pendencia ou conferencia.'
    );

    const historyResponse = await requestJson(
      `/companies/${empresa.id}/operational-history`,
      {
        cookie: sessionCookie
      }
    );

    expect(historyResponse.response.status).toBe(200);
    expect(historyResponse.body).toMatchObject({
      empresaId: empresa.id,
      empresa: {
        empresaId: empresa.id,
        pendenciaOperacional: true,
        ultimaConferenciaOperacionalEm: '2026-04-13T08:00:00.000Z'
      }
    });
    expect(historyResponse.body).toMatchObject({
      ultimoLog: {
        tipo: TipoLogExecucao.REVISAO_OPERACIONAL
      }
    });
    expect(
      (historyResponse.body as { logs: unknown[]; pendenciasAbertas: unknown[] })
        .logs
    ).toHaveLength(1);
    expect(
      (
        historyResponse.body as {
          logs: Array<{ tipo: string }>;
          pendenciasAbertas: unknown[];
        }
      ).logs[0]?.tipo
    ).toBe(TipoLogExecucao.REVISAO_OPERACIONAL);
    expect(
      (
        historyResponse.body as { pendenciasAbertas: unknown[] }
      ).pendenciasAbertas
    ).toHaveLength(1);
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
    responsavelId: responsavel.id,
    empresaRegularizeId: empresaRegularize.id,
    empresaRemoveId: empresaRemove.id,
    pendenciaRegularizeId: pendenciaRegularize.id
  };
}

async function loadAdminUserId(database: PrismaClient): Promise<string> {
  const admin = await database.usuarioInterno.findUniqueOrThrow({
    select: {
      id: true
    },
    where: {
      email: ADMIN_EMAIL
    }
  });

  return admin.id;
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
