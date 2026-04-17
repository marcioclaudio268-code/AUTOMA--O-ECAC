// @vitest-environment jsdom

import React, { act } from 'react';
import { Simulate } from 'react-dom/test-utils';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import type {
  CompanyDetailItem,
  CompanyOperationalHistory
} from '@/lib/api';

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function buildCompany(): CompanyDetailItem {
  return {
    cnpj: '11111111000191',
    certificadoDigitalImplementadoEm: null,
    certificadoDigitalValidoAte: null,
    createdAt: '2026-04-16T12:00:00.000Z',
    id: 'company-1',
    integracoes: [
      {
        createdAt: '2026-04-16T11:50:00.000Z',
        empresaId: 'company-1',
        id: 'integration-existing-1',
        mensagemErroAtual: 'Retorno externo anterior exigiu conferencia.',
        observacoes:
          'Ultima validacao confiavel Acessorias em Empresa Alfa Ltda.',
        statusIntegracao: 'NECESSITA_CONFERENCIA',
        tipoIntegracao: 'API',
        ultimaExecucaoEm: '2026-04-16T11:59:00.000Z',
        updatedAt: '2026-04-16T11:59:00.000Z',
        ultimoErroEm: '2026-04-16T11:59:00.000Z',
        ultimoSucessoEm: '2026-04-16T11:40:00.000Z'
      }
    ],
    naCarteira: true,
    nomeFantasia: 'Empresa Alfa',
    observacoesOperacionais: null,
    pendenciaOperacional: false,
    procuracaoImplementadaEm: null,
    procuracaoValidaAte: null,
    razaoSocial: 'Empresa Alfa Ltda',
    regimeTributario: 'SIMPLES_NACIONAL',
    responsavelInterno: null,
    responsavelInternoId: null,
    regularizadaEm: null,
    statusAcesso: 'NAO_VERIFICADO',
    statusProcuracao: 'NAO_VERIFICADA',
    ultimaConferenciaAcessoEm: null,
    ultimaConferenciaOperacionalEm: null,
    ultimaConferenciaProcuracaoEm: null,
    ultimaVarreduraEm: null,
    ultimoEventoRelevanteEm: null,
    updatedAt: '2026-04-16T12:00:00.000Z'
  } as CompanyDetailItem;
}

function buildOperationalHistory(): CompanyOperationalHistory {
  return {
    empresa: {
      cnpj: '11111111000191',
      empresaId: 'company-1',
      empresaNome: 'Empresa Alfa Ltda',
      naCarteira: true,
      nomeFantasia: 'Empresa Alfa',
      observacoesOperacionais: null,
      pendenciaOperacional: false,
      regularizadaEm: null,
      responsavelInternoId: null,
      responsavelInternoNome: null,
      statusAcesso: 'NAO_VERIFICADO',
      statusProcuracao: 'NAO_VERIFICADA',
      ultimaConferenciaAcessoEm: null,
      ultimaConferenciaOperacionalEm: null,
      ultimaConferenciaProcuracaoEm: null,
      ultimaVarreduraEm: null,
      ultimoEventoRelevanteEm: null,
      updatedAt: '2026-04-16T12:00:00.000Z'
    },
    empresaId: 'company-1',
    empresaNome: 'Empresa Alfa Ltda',
    logs: [],
    pendencias: [],
    pendenciasAbertas: [],
    pendenciasEncerradasRecentes: [],
    ultimoLog: null
  };
}

const mockState = vi.hoisted(() => ({
  createCompanyPendenciaMock: vi.fn(),
  executeAcessoriasCompanyLoopMock: vi.fn(),
  executeDividaAtivaCompanyLoopMock: vi.fn(),
  executeManualScanMock: vi.fn(),
  getCompanyMock: vi.fn(),
  getHistoryMock: vi.fn(),
  listEventosOperacionaisMock: vi.fn(),
  listResponsaveisMock: vi.fn(),
  listVarredurasMock: vi.fn(),
  regularizeCompanyOperationalIssueMock: vi.fn(),
  registerCompanyCheckMock: vi.fn(),
  registerCompanyOperationalReviewMock: vi.fn(),
  requireSessionMock: vi.fn(),
  routerMock: { replace: vi.fn() },
  signOutMock: vi.fn(),
  updateCompanyMock: vi.fn()
}));

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'company-1' }),
  useRouter: () => mockState.routerMock
}));

vi.mock('next/link', () => ({
  default: ({
    children,
    href
  }: {
    children: React.ReactNode;
    href: string;
  }) => React.createElement('a', { href }, children)
}));

vi.mock('@/lib/auth', () => ({
  requireSession: mockState.requireSessionMock,
  signOut: mockState.signOutMock
}));

vi.mock('@/lib/api', () => ({
  createCompanyPendencia: mockState.createCompanyPendenciaMock,
  executeAcessoriasCompanyLoop: mockState.executeAcessoriasCompanyLoopMock,
  executeDividaAtivaCompanyLoop: mockState.executeDividaAtivaCompanyLoopMock,
  executeManualScan: mockState.executeManualScanMock,
  getCompany: mockState.getCompanyMock,
  getCompanyOperationalHistory: mockState.getHistoryMock,
  listEventosOperacionais: mockState.listEventosOperacionaisMock,
  listResponsaveis: mockState.listResponsaveisMock,
  listVarreduras: mockState.listVarredurasMock,
  regularizeCompanyOperationalIssue:
    mockState.regularizeCompanyOperationalIssueMock,
  registerCompanyCheck: mockState.registerCompanyCheckMock,
  registerCompanyOperationalReview:
    mockState.registerCompanyOperationalReviewMock,
  updateCompany: mockState.updateCompanyMock
}));

import CompanyPage from './page';

let root: Root | null = null;
let container: HTMLDivElement;

beforeEach(() => {
  document.body.innerHTML = '';
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

  mockState.createCompanyPendenciaMock.mockReset();
  mockState.executeAcessoriasCompanyLoopMock.mockReset();
  mockState.executeDividaAtivaCompanyLoopMock.mockReset();
  mockState.executeManualScanMock.mockReset();
  mockState.getCompanyMock.mockReset();
  mockState.getHistoryMock.mockReset();
  mockState.listEventosOperacionaisMock.mockReset();
  mockState.listResponsaveisMock.mockReset();
  mockState.listVarredurasMock.mockReset();
  mockState.regularizeCompanyOperationalIssueMock.mockReset();
  mockState.registerCompanyCheckMock.mockReset();
  mockState.registerCompanyOperationalReviewMock.mockReset();
  mockState.requireSessionMock.mockReset();
  mockState.routerMock.replace.mockReset();
  mockState.signOutMock.mockReset();
  mockState.updateCompanyMock.mockReset();

  mockState.requireSessionMock.mockResolvedValue({
    email: 'usuario@ecac.local',
    id: 'user-1',
    nome: 'Usuario ECAC',
    perfil: 'ADMIN'
  });
  mockState.getCompanyMock.mockResolvedValue(buildCompany());
  mockState.getHistoryMock.mockResolvedValue(buildOperationalHistory());
  mockState.listResponsaveisMock.mockResolvedValue([]);
  mockState.listVarredurasMock.mockResolvedValue([]);
  mockState.listEventosOperacionaisMock.mockResolvedValue([]);
  mockState.executeAcessoriasCompanyLoopMock.mockResolvedValue({
    integration: {
      createdAt: '2026-04-16T12:10:00.000Z',
      empresaId: 'company-1',
      id: 'integration-1',
      mensagemErroAtual: null,
      observacoes: null,
      statusIntegracao: 'ATIVA',
      tipoIntegracao: 'API',
      ultimaExecucaoEm: '2026-04-16T12:10:00.000Z',
      updatedAt: '2026-04-16T12:10:00.000Z',
      ultimoErroEm: null,
      ultimoSucessoEm: '2026-04-16T12:10:00.000Z'
    },
    message: 'Loop Acessorias executado com sucesso.',
    success: true,
    varredura: {
      createdAt: '2026-04-16T12:10:00.000Z',
      empresaId: 'company-1',
      finalizadoEm: '2026-04-16T12:10:00.000Z',
      id: 'scan-1',
      iniciadoEm: '2026-04-16T12:09:30.000Z',
      resumoResultado: 'Loop Acessorias executado com sucesso.',
      statusExecucao: 'CONCLUIDA',
      tipoVarredura: 'ACESSORIAS',
      updatedAt: '2026-04-16T12:10:00.000Z'
    }
  });
  mockState.executeDividaAtivaCompanyLoopMock.mockResolvedValue({
    integration: {
      createdAt: '2026-04-16T12:11:00.000Z',
      empresaId: 'company-1',
      id: 'integration-2',
      mensagemErroAtual: null,
      observacoes: null,
      statusIntegracao: 'ATIVA',
      tipoIntegracao: 'API',
      ultimaExecucaoEm: '2026-04-16T12:11:00.000Z',
      updatedAt: '2026-04-16T12:11:00.000Z',
      ultimoErroEm: null,
      ultimoSucessoEm: '2026-04-16T12:11:00.000Z'
    },
    message: 'Leitura de divida ativa concluida para Empresa Alfa Ltda.',
    success: true,
    summary: {
      activeCount: 0,
      actionableCount: 0,
      createdCount: 0,
      deactivatedCount: 0,
      semOcorrencia: true,
      updatedCount: 0
    },
    varredura: {
      createdAt: '2026-04-16T12:11:00.000Z',
      empresaId: 'company-1',
      finalizadoEm: '2026-04-16T12:11:00.000Z',
      id: 'scan-2',
      iniciadoEm: '2026-04-16T12:10:30.000Z',
      resumoResultado: 'Leitura de divida ativa concluida.',
      statusExecucao: 'CONCLUIDA',
      tipoVarredura: 'DIVIDA_ATIVA',
      updatedAt: '2026-04-16T12:11:00.000Z'
    }
  });

  mockState.updateCompanyMock.mockResolvedValue({
    updatedAt: '2026-04-16T12:10:00.000Z'
  });
  mockState.executeManualScanMock.mockResolvedValue({
    varredura: {
      createdAt: '2026-04-16T12:10:00.000Z',
      empresaId: 'company-1',
      finalizadoEm: '2026-04-16T12:10:00.000Z',
      id: 'scan-manual-1',
      iniciadoEm: '2026-04-16T12:09:30.000Z',
      resumoResultado: 'Varredura manual executada.',
      statusExecucao: 'CONCLUIDA',
      tipoVarredura: 'MANUAL',
      updatedAt: '2026-04-16T12:10:00.000Z'
    }
  });
});

afterEach(async () => {
  await act(async () => {
    root?.unmount();
  });
  root = null;
});

test('renderiza a pagina e dispara o loop Acessorias da empresa', async () => {
  await act(async () => {
    root?.render(<CompanyPage />);
  });

  await waitForText('Executar Acessorias nesta empresa');
  await waitForText('Executar divida ativa nesta empresa');
  await waitForText('Necessita conferencia');
  await waitForText('Ultima execucao');
  await waitForText('Ultimo sucesso');
  await waitForText('Ultimo erro');

  const button = findButtonByText('Executar Acessorias nesta empresa');

  await act(async () => {
    Simulate.click(button);
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  await waitForText('Loop Acessorias executado com sucesso.');

  expect(mockState.executeAcessoriasCompanyLoopMock).toHaveBeenCalledTimes(1);
  expect(mockState.executeAcessoriasCompanyLoopMock).toHaveBeenCalledWith(
    'company-1'
  );

  const dividaAtivaButton = findButtonByText('Executar divida ativa nesta empresa');

  await act(async () => {
    Simulate.click(dividaAtivaButton);
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  await waitForText('Leitura de divida ativa concluida para Empresa Alfa Ltda.');

  expect(mockState.executeDividaAtivaCompanyLoopMock).toHaveBeenCalledTimes(1);
  expect(mockState.executeDividaAtivaCompanyLoopMock).toHaveBeenCalledWith(
    'company-1'
  );
}, 20_000);

function findButtonByText(text: string): HTMLButtonElement {
  const buttons = Array.from(container.querySelectorAll('button'));
  const button = buttons.find((candidate) => candidate.textContent === text);
  if (!button) {
    throw new Error(`Botao nao encontrado: ${text}`);
  }
  return button as HTMLButtonElement;
}

async function waitForText(text: string): Promise<void> {
  for (let index = 0; index < 20; index += 1) {
    if (container.textContent?.includes(text)) {
      return;
    }

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }

  throw new Error(`Texto nao encontrado: ${text}`);
}
