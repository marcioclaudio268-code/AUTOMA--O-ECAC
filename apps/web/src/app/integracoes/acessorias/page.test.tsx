// @vitest-environment jsdom

import React, { act } from 'react';
import { Simulate } from 'react-dom/test-utils';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import type {
  AcessoriasCompanyLinkRecord,
  AcessoriasConfigRecord,
  AcessoriasJobRecord,
  CompanyListItem
} from '@/lib/api';

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function buildDefaultConfig(): AcessoriasConfigRecord {
  return {
    apiTokenConfigurado: false,
    apiTokenMascarado: null,
    createdAt: null,
    id: 'acessorias-config',
    mensagemErroAtual: null,
    status: 'NAO_CONFIGURADA',
    ultimaSincronizacaoEm: null,
    ultimoErroEm: null,
    updatedAt: null
  };
}

function buildJob(overrides: Partial<AcessoriasJobRecord> = {}): AcessoriasJobRecord {
  return {
    atualizados: 0,
    createdAt: '2026-04-15T12:00:00.000Z',
    criados: 0,
    detalhesErro: null,
    finalizadoEm: null,
    falhas: 0,
    id: 'job-1',
    iniciadoEm: '2026-04-15T12:00:00.000Z',
    ignorados: 0,
    processados: 0,
    status: 'INICIADO',
    tipoJob: 'TESTE_CONEXAO',
    ...overrides
  };
}

function buildInternalCompany(
  overrides: Partial<CompanyListItem> = {}
): CompanyListItem {
  return {
    cnpj: '11111111000191',
    createdAt: '2026-04-15T12:00:00.000Z',
    id: 'company-auto',
    naCarteira: true,
    nomeFantasia: 'Empresa Auto ECAC',
    observacoesOperacionais: null,
    pendenciaOperacional: false,
    razaoSocial: 'Empresa Auto ECAC Ltda',
    regimeTributario: 'SIMPLES_NACIONAL',
    responsavelInterno: null,
    responsavelInternoId: null,
    regularizadaEm: null,
    statusAcesso: 'NAO_VERIFICADO',
    statusProcuracao: 'NAO_VERIFICADA',
    ultimaConferenciaOperacionalEm: null,
    ultimaVarreduraEm: null,
    ultimoEventoRelevanteEm: null,
    updatedAt: '2026-04-15T12:00:00.000Z',
    ...overrides
  } as CompanyListItem;
}

function buildExternalCompany(
  overrides: Partial<AcessoriasCompanyLinkRecord> = {}
): AcessoriasCompanyLinkRecord {
  return {
    acessoriasEmpresaId: 'ext-auto-1',
    cnpjExterno: '11111111000191',
    createdAt: '2026-04-15T12:00:00.000Z',
    empresa: null,
    empresaId: null,
    id: 'vinculo-1',
    matchAutomatico: false,
    nomeExterno: 'Empresa Externa Auto Ltda',
    sincronizacaoHabilitada: false,
    statusVinculo: 'NAO_VINCULADA',
    ultimaSincronizacaoEm: null,
    updatedAt: '2026-04-15T12:00:00.000Z',
    ...overrides
  } as AcessoriasCompanyLinkRecord;
}

const mockState = vi.hoisted(() => ({
  createConfigMock: vi.fn(),
  currentCompanies: [] as AcessoriasCompanyLinkRecord[],
  currentConfig: buildDefaultConfig(),
  currentInternalCompanies: [
    buildInternalCompany({
      id: 'company-auto',
      nomeFantasia: 'Empresa Auto ECAC',
      razaoSocial: 'Empresa Auto ECAC Ltda'
    }),
    buildInternalCompany({
      cnpj: '22222222000172',
      id: 'company-manual',
      nomeFantasia: 'Empresa Manual ECAC',
      razaoSocial: 'Empresa Manual ECAC Ltda'
    })
  ] as CompanyListItem[],
  currentJobs: [] as AcessoriasJobRecord[],
  getConfigMock: vi.fn(),
  linkCompanyMock: vi.fn(),
  listCompaniesMock: vi.fn(),
  listExternalCompaniesMock: vi.fn(),
  listJobsMock: vi.fn(),
  replaceMock: vi.fn(),
  requireSessionMock: vi.fn(),
  routerMock: { replace: vi.fn() },
  signOutMock: vi.fn(),
  syncCompaniesMock: vi.fn(),
  testConnectionMock: vi.fn(),
  unlinkCompanyMock: vi.fn(),
  updateConfigMock: vi.fn()
}));

vi.mock('next/navigation', () => ({
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
  createAcessoriasConfig: mockState.createConfigMock,
  getAcessoriasConfig: mockState.getConfigMock,
  linkAcessoriasCompany: mockState.linkCompanyMock,
  listAcessoriasCompanies: mockState.listExternalCompaniesMock,
  listAcessoriasJobs: mockState.listJobsMock,
  listCompanies: mockState.listCompaniesMock,
  syncAcessoriasCompanies: mockState.syncCompaniesMock,
  testAcessoriasConnection: mockState.testConnectionMock,
  unlinkAcessoriasCompany: mockState.unlinkCompanyMock,
  updateAcessoriasConfig: mockState.updateConfigMock
}));

import AcessoriasPage from './page';

let root: Root | null = null;
let container: HTMLDivElement;

beforeEach(() => {
  document.body.innerHTML = '';
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

  mockState.currentConfig = buildDefaultConfig();
  mockState.currentCompanies = [];
  mockState.currentJobs = [];

  mockState.replaceMock.mockReset();
  mockState.routerMock.replace.mockReset();
  mockState.requireSessionMock.mockResolvedValue({
    email: 'usuario@ecac.local',
    id: 'user-1',
    nome: 'Usuario ECAC',
    perfil: 'ADMIN'
  });
  mockState.signOutMock.mockResolvedValue({ success: true });
  mockState.getConfigMock.mockImplementation(async () => mockState.currentConfig);
  mockState.listJobsMock.mockImplementation(async () => mockState.currentJobs);
  mockState.listExternalCompaniesMock.mockImplementation(async () => mockState.currentCompanies);
  mockState.listCompaniesMock.mockImplementation(async () => mockState.currentInternalCompanies);

  mockState.createConfigMock.mockImplementation(async ({ apiToken }: { apiToken: string }) => {
    expect(apiToken).toBe('token-criar');
    mockState.currentConfig = {
      ...mockState.currentConfig,
      apiTokenConfigurado: true,
      apiTokenMascarado: '********',
      createdAt: '2026-04-15T12:01:00.000Z',
      mensagemErroAtual: null,
      status: 'CONFIGURADA',
      ultimaSincronizacaoEm: null,
      ultimoErroEm: null,
      updatedAt: '2026-04-15T12:01:00.000Z'
    };
    return mockState.currentConfig;
  });

  mockState.updateConfigMock.mockImplementation(async ({ apiToken }: { apiToken: string }) => {
    expect(apiToken).toBe('token-editar');
    mockState.currentConfig = {
      ...mockState.currentConfig,
      apiTokenConfigurado: true,
      apiTokenMascarado: '********',
      mensagemErroAtual: null,
      status: 'CONFIGURADA',
      updatedAt: '2026-04-15T12:02:00.000Z'
    };
    return mockState.currentConfig;
  });

  mockState.testConnectionMock.mockImplementation(async () => {
    const job = buildJob({
      finalizadoEm: '2026-04-15T12:03:00.000Z',
      id: 'job-2',
      iniciadoEm: '2026-04-15T12:02:30.000Z',
      status: 'SUCESSO'
    });

    mockState.currentConfig = {
      ...mockState.currentConfig,
      mensagemErroAtual: null,
      status: 'ATIVA',
      ultimoErroEm: null,
      updatedAt: '2026-04-15T12:03:00.000Z'
    };
    mockState.currentJobs = [job, ...mockState.currentJobs];

    return {
      config: mockState.currentConfig,
      job,
      message: 'Conexao com Acessorias validada.',
      success: true
    };
  });
  mockState.syncCompaniesMock.mockImplementation(async () => {
    const job = buildJob({
      atualizados: 0,
      criados: 2,
      detalhesErro: null,
      finalizadoEm: '2026-04-15T12:04:00.000Z',
      falhas: 0,
      id: 'job-sync-1',
      iniciadoEm: '2026-04-15T12:03:00.000Z',
      ignorados: 0,
      processados: 2,
      status: 'SUCESSO',
      tipoJob: 'SINCRONIZACAO_EMPRESAS'
    });

    mockState.currentConfig = {
      ...mockState.currentConfig,
      mensagemErroAtual: null,
      status: 'ATIVA',
      ultimaSincronizacaoEm: '2026-04-15T12:04:00.000Z',
      ultimoErroEm: null,
      updatedAt: '2026-04-15T12:04:00.000Z'
    };

    mockState.currentCompanies = [
      buildExternalCompany({
        acessoriasEmpresaId: 'ext-auto-1',
        cnpjExterno: '11111111000191',
        empresa: mockState.currentInternalCompanies[0] ?? null,
        empresaId: 'company-auto',
        id: 'ext-auto-1',
        matchAutomatico: true,
        nomeExterno: 'Empresa Externa Auto Ltda',
        sincronizacaoHabilitada: true,
        statusVinculo: 'VINCULADA',
        ultimaSincronizacaoEm: '2026-04-15T12:04:00.000Z'
      }),
      buildExternalCompany({
        acessoriasEmpresaId: 'ext-manual-1',
        cnpjExterno: '22222222000172',
        empresa: null,
        empresaId: null,
        id: 'ext-manual-1',
        matchAutomatico: false,
        nomeExterno: 'Empresa Externa Manual Ltda',
        sincronizacaoHabilitada: false,
        statusVinculo: 'NAO_VINCULADA',
        ultimaSincronizacaoEm: '2026-04-15T12:04:00.000Z'
      })
    ];
    mockState.currentJobs = [job, ...mockState.currentJobs];

    return {
      config: mockState.currentConfig,
      job,
      message: 'Sincronizacao de empresas concluida.',
      summary: {
        atualizados: 0,
        criados: 2,
        falhas: 0,
        ignorados: 0,
        pendentes: 1,
        processados: 2,
        vinculadosAutomaticamente: 1
      }
    };
  });

  mockState.linkCompanyMock.mockImplementation(async (empresaId: string, payload: { acessoriasEmpresaId: string }) => {
    const company = mockState.currentCompanies.find(
      (item) => item.acessoriasEmpresaId === payload.acessoriasEmpresaId
    );

    if (!company) {
      throw new Error('Empresa externa Acessorias nao encontrada.');
    }

    const linkedCompany = mockState.currentInternalCompanies.find(
      (item) => item.id === empresaId
    ) ?? null;

    const updated = {
      ...company,
      empresa: linkedCompany,
      empresaId,
      matchAutomatico: false,
      sincronizacaoHabilitada: true,
      statusVinculo: 'VINCULADA' as const,
      ultimaSincronizacaoEm: '2026-04-15T12:05:00.000Z'
    };

    mockState.currentCompanies = mockState.currentCompanies.map((item) =>
      item.acessoriasEmpresaId === payload.acessoriasEmpresaId ? updated : item
    );

    return updated;
  });

  mockState.unlinkCompanyMock.mockImplementation(async (empresaId: string) => {
    const company = mockState.currentCompanies.find(
      (item) => item.empresaId === empresaId
    );

    if (!company) {
      throw new Error('Vinculo Acessorias nao encontrado.');
    }

    const updated = {
      ...company,
      empresa: null,
      empresaId: null,
      matchAutomatico: false,
      sincronizacaoHabilitada: false,
      statusVinculo: 'IGNORADA' as const,
      ultimaSincronizacaoEm: '2026-04-15T12:06:00.000Z'
    };

    mockState.currentCompanies = mockState.currentCompanies.map((item) =>
      item.empresaId === empresaId ? updated : item
    );

    return updated;
  });
});

afterEach(() => {
  root?.unmount();
  root = null;
  mockState.createConfigMock.mockReset();
  mockState.updateConfigMock.mockReset();
  mockState.testConnectionMock.mockReset();
  mockState.syncCompaniesMock.mockReset();
  mockState.linkCompanyMock.mockReset();
  mockState.unlinkCompanyMock.mockReset();
  mockState.getConfigMock.mockReset();
  mockState.listJobsMock.mockReset();
  mockState.listExternalCompaniesMock.mockReset();
  mockState.listCompaniesMock.mockReset();
  mockState.routerMock.replace.mockReset();
  mockState.requireSessionMock.mockReset();
  mockState.signOutMock.mockReset();
  mockState.currentConfig = buildDefaultConfig();
  mockState.currentCompanies = [];
  mockState.currentJobs = [];
});

test('renderiza a pagina e aciona o fluxo principal de configuracao, teste e sync', async () => {
  await act(async () => {
    root?.render(<AcessoriasPage />);
  });

  await waitForText('Nao configurada');
  await waitForText('Nenhuma empresa externa sincronizada ainda.');

  expect(mockState.requireSessionMock).toHaveBeenCalledTimes(1);
  expect(mockState.getConfigMock).toHaveBeenCalledTimes(1);
  expect(mockState.listJobsMock).toHaveBeenCalledTimes(1);
  expect(mockState.listExternalCompaniesMock).toHaveBeenCalledTimes(1);
  expect(mockState.listCompaniesMock).toHaveBeenCalledTimes(1);

  const input = container.querySelector('input[name="apiToken"]') as HTMLInputElement | null;
  expect(input).not.toBeNull();

  await act(async () => {
    if (input) {
      Simulate.change(input, { target: { value: 'token-criar' } });
    }
  });

  const form = findForm();
  await act(async () => {
    Simulate.submit(form);
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  await waitForText('Configuracao Acessorias criada com sucesso.');
  expect(mockState.createConfigMock).toHaveBeenCalledTimes(1);
  expect(mockState.updateConfigMock).not.toHaveBeenCalled();

  await act(async () => {
    if (input) {
      Simulate.change(input, { target: { value: 'token-editar' } });
    }
  });
  await act(async () => {
    Simulate.submit(form);
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  await waitForText('Configuracao Acessorias atualizada com sucesso.');
  expect(mockState.updateConfigMock).toHaveBeenCalledTimes(1);

  const testButton = findButtonByText('Testar conexao');
  await act(async () => {
    Simulate.click(testButton);
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  await waitForText('Conexao com Acessorias validada.');
  expect(mockState.testConnectionMock).toHaveBeenCalledTimes(1);
  expect(mockState.currentConfig.status).toBe('ATIVA');
  expect(mockState.currentJobs[0]?.tipoJob).toBe('TESTE_CONEXAO');

  const syncButton = findButtonByText('Sincronizar empresas');
  await act(async () => {
    Simulate.click(syncButton);
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  await waitForText('Empresa Externa Auto Ltda');
  await waitForText('Empresa Externa Manual Ltda');
  await waitForText('Historico de sincronizacao de empresas');
  expect(mockState.syncCompaniesMock).toHaveBeenCalledTimes(1);
  expect(mockState.currentJobs[0]?.tipoJob).toBe('SINCRONIZACAO_EMPRESAS');
  expect(container.textContent).toContain('Vinculadas');
  expect(container.textContent).toContain('Pendentes');
}, 20_000);

test('permite vincular manualmente e remover vinculo', async () => {
  await act(async () => {
    root?.render(<AcessoriasPage />);
  });

  await waitForText('Nenhuma empresa externa sincronizada ainda.');

  const syncButton = findButtonByText('Sincronizar empresas');
  await act(async () => {
    Simulate.click(syncButton);
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  await waitForText('Empresa Externa Manual Ltda');

  const select = findSelectById('internal-company-ext-manual-1');
  await act(async () => {
    Simulate.change(select, { target: { value: 'company-manual' } });
  });

  const linkButton = findButtonByText('Vincular');
  await act(async () => {
    Simulate.click(linkButton);
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  await waitForText('Empresa Manual ECAC Ltda');
  await waitForText('Vinculada');
  expect(mockState.linkCompanyMock).toHaveBeenCalledTimes(1);
  expect(mockState.currentCompanies.find((item) => item.acessoriasEmpresaId === 'ext-manual-1')?.statusVinculo).toBe('VINCULADA');

  const manualRow = findRowByText('Empresa Externa Manual Ltda');
  const removeButton = findButtonInRow(manualRow, 'Remover vinculo');
  await act(async () => {
    Simulate.click(removeButton);
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  await waitForText('Ignorada manualmente');
  expect(mockState.unlinkCompanyMock).toHaveBeenCalledTimes(1);
  expect(mockState.currentCompanies.find((item) => item.acessoriasEmpresaId === 'ext-manual-1')?.statusVinculo).toBe('IGNORADA');
}, 20_000);

function findButtonByText(text: string): HTMLButtonElement {
  const buttons = Array.from(container.querySelectorAll('button'));
  const button = buttons.find((candidate) => candidate.textContent === text);
  if (!button) throw new Error(`Botao nao encontrado: ${text}`);
  return button as HTMLButtonElement;
}

function findForm(): HTMLFormElement {
  const form = container.querySelector('form');
  if (!form) throw new Error('Formulario nao encontrado.');
  return form as HTMLFormElement;
}

function findSelectById(id: string): HTMLSelectElement {
  const select = container.querySelector(`select#${id}`);
  if (!select) throw new Error(`Select nao encontrado: ${id}`);
  return select as HTMLSelectElement;
}

function findRowByText(text: string): HTMLTableRowElement {
  const rows = Array.from(container.querySelectorAll('tr'));
  const row = rows.find((candidate) => candidate.textContent?.includes(text));
  if (!row) throw new Error(`Linha nao encontrada: ${text}`);
  return row as HTMLTableRowElement;
}

function findButtonInRow(
  row: HTMLTableRowElement,
  text: string
): HTMLButtonElement {
  const buttons = Array.from(row.querySelectorAll('button'));
  const button = buttons.find((candidate) => candidate.textContent === text);
  if (!button) throw new Error(`Botao nao encontrado na linha: ${text}`);
  return button as HTMLButtonElement;
}

async function waitForText(text: string): Promise<void> {
  for (let index = 0; index < 20; index += 1) {
    if (container.textContent?.includes(text)) return;
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
  }
  throw new Error(`Texto nao encontrado: ${text}`);
}
