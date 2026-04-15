// @vitest-environment jsdom

import React, { act } from 'react';
import { Simulate } from 'react-dom/test-utils';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import type {
  AcessoriasConfigRecord,
  AcessoriasJobRecord
} from '@/lib/api';

(
  globalThis as typeof globalThis & {
    IS_REACT_ACT_ENVIRONMENT?: boolean;
  }
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

const mockState = vi.hoisted(() => ({
  createConfigMock: vi.fn(),
  currentConfig: buildDefaultConfig(),
  currentJobs: [] as AcessoriasJobRecord[],
  getConfigMock: vi.fn(),
  listJobsMock: vi.fn(),
  routerMock: {
    replace: vi.fn()
  },
  replaceMock: vi.fn(),
  requireSessionMock: vi.fn(),
  signOutMock: vi.fn(),
  testConnectionMock: vi.fn(),
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
  listAcessoriasJobs: mockState.listJobsMock,
  testAcessoriasConnection: mockState.testConnectionMock,
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
});

afterEach(() => {
  root?.unmount();
  root = null;
  mockState.createConfigMock.mockReset();
  mockState.updateConfigMock.mockReset();
  mockState.testConnectionMock.mockReset();
  mockState.getConfigMock.mockReset();
  mockState.listJobsMock.mockReset();
  mockState.routerMock.replace.mockReset();
  mockState.requireSessionMock.mockReset();
  mockState.signOutMock.mockReset();
  mockState.currentConfig = buildDefaultConfig();
  mockState.currentJobs = [];
});

test('renderiza a pagina e aciona o fluxo principal de configuracao e teste', async () => {
  await act(async () => {
    root?.render(<AcessoriasPage />);
  });

  await waitForText('Nao configurada');

  expect(mockState.requireSessionMock).toHaveBeenCalledTimes(1);
  expect(mockState.getConfigMock).toHaveBeenCalledTimes(1);
  expect(mockState.listJobsMock).toHaveBeenCalledTimes(1);
  expect(container.textContent).toContain('Nenhum job registrado ainda.');

  const input = container.querySelector(
    'input[name="apiToken"]'
  ) as HTMLInputElement | null;
  expect(input).not.toBeNull();

  await act(async () => {
    if (input) {
      Simulate.change(input, {
        target: {
          value: 'token-criar'
        }
      });
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
      Simulate.change(input, {
        target: {
          value: 'token-editar'
        }
      });
    }
  });

  await act(async () => {
    Simulate.submit(form);
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  await waitForText('Configuracao Acessorias atualizada com sucesso.');
  expect(mockState.updateConfigMock).toHaveBeenCalledTimes(1);
  expect(mockState.createConfigMock).toHaveBeenCalledTimes(1);

  const testButton = findButtonByText('Testar conexao');

  await act(async () => {
    Simulate.click(testButton);
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  await waitForText('Conexao com Acessorias validada.');
  await waitForText('Sucesso');
  await waitForText('Teste de conexao');

  expect(mockState.testConnectionMock).toHaveBeenCalledTimes(1);
  expect(mockState.currentConfig.status).toBe('ATIVA');
  expect(mockState.currentJobs).toHaveLength(1);
  expect(container.textContent).toContain('Conexao com Acessorias validada.');
}, 20_000);

function findButtonByText(text: string): HTMLButtonElement {
  const buttons = Array.from(container.querySelectorAll('button'));
  const button = buttons.find((candidate) => candidate.textContent === text);

  if (!button) {
    throw new Error(`Botao nao encontrado: ${text}`);
  }

  return button as HTMLButtonElement;
}

function findForm(): HTMLFormElement {
  const form = container.querySelector('form');

  if (!form) {
    throw new Error('Formulario nao encontrado.');
  }

  return form as HTMLFormElement;
}

async function waitForText(text: string): Promise<void> {
  const attempts = 20;

  for (let index = 0; index < attempts; index += 1) {
    if (container.textContent?.includes(text)) {
      return;
    }

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }

  throw new Error(`Texto nao encontrado: ${text}`);
}
