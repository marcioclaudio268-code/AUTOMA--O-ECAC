import { Prisma } from '@prisma/client';

export const INTEGRA_CONTADOR_NOT_CONFIGURED_MESSAGE =
  'Integracao INTEGRA_CONTADOR nao configurada. Consulte docs/integracoes/integra-contador-http-contract.md e preencha INTEGRA_CONTADOR_HTTP_CONTRACT_JSON.';

export const INTEGRA_CONTADOR_CONTRACT_INVALID_MESSAGE =
  'Configuracao de INTEGRA_CONTADOR invalida. Revise o JSON informado.';

export const INTEGRA_CONTADOR_CONTRACT_READY_MESSAGE =
  'Contrato de INTEGRA_CONTADOR completo no ambiente, mas a chamada real ainda nao foi conectada neste bloco.';

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
  razaoSocial: string;
};

export type CompanyIntegrationExecutionAttempt = {
  message: string;
  observacoes?: string | null;
  success: boolean;
};
