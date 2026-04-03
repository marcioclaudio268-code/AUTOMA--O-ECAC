import { Prisma } from '@prisma/client';

import type { IntegraContadorPessoaTipo } from './utils/integra-contador-documents';

export const INTEGRA_CONTADOR_PROCURACOES_SYSTEM_ID = 'PROCURACOES';
export const INTEGRA_CONTADOR_PROCURACOES_SERVICE_ID = 'OBTERPROCURACAO41';
export const INTEGRA_CONTADOR_PROCURACOES_SYSTEM_VERSION = '1';

export const companyIntegrationSelect = {
  createdAt: true,
  empresaId: true,
  id: true,
  mensagemErroAtual: true,
  observacoes: true,
  statusIntegracao: true,
  tipoIntegracao: true,
  updatedAt: true,
  ultimoErroEm: true,
  ultimoSucessoEm: true
} as const;

export type CompanyIntegrationRecord = Prisma.IntegracaoEmpresaGetPayload<{
  select: typeof companyIntegrationSelect;
}>;

export type CompanyIntegrationExecutionContext = {
  cnpj: string;
  companyId: string;
  nomeFantasia: string | null;
  observacoesOperacionais: string | null;
  razaoSocial: string;
};

export type CompanyIntegrationExecutionInput = {
  outorgado: string;
  outorgante: string;
  tipoOutorgado?: IntegraContadorPessoaTipo | undefined;
  tipoOutorgante?: IntegraContadorPessoaTipo | undefined;
};

export type CompanyIntegrationExecutionAttempt = {
  haProcuracaoEncontrada: boolean;
  message: string;
  observacoes?: string | null;
  quantidadeRegistrosRetornados: number;
  success: boolean;
};
