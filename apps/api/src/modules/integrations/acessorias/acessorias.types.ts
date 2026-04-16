import type {
  StatusAcessoriasSyncJob,
  StatusIntegracaoAcessorias,
  TipoAcessoriasSyncJob,
  StatusExecucaoVarredura,
  StatusIntegracao,
  TipoIntegracao,
  TipoVarredura
} from '@prisma/client';

export type AcessoriasConfigView = {
  apiTokenConfigurado: boolean;
  apiTokenMascarado: string | null;
  createdAt: string | null;
  id: string;
  mensagemErroAtual: string | null;
  status: StatusIntegracaoAcessorias;
  ultimaSincronizacaoEm: string | null;
  ultimoErroEm: string | null;
  updatedAt: string | null;
};

export type AcessoriasJobView = {
  atualizados: number;
  createdAt: string;
  criados: number;
  detalhesErro: string | null;
  finalizadoEm: string | null;
  falhas: number;
  id: string;
  iniciadoEm: string;
  ignorados: number;
  processados: number;
  status: StatusAcessoriasSyncJob;
  tipoJob: TipoAcessoriasSyncJob;
};

export type AcessoriasCompanySummaryView = {
  cnpj: string;
  id: string;
  nomeFantasia: string | null;
  razaoSocial: string;
};

export type StatusAcessoriasEmpresaVinculo =
  | 'NAO_VINCULADA'
  | 'VINCULADA'
  | 'AMBIGUA'
  | 'IGNORADA';

export type AcessoriasCompanyLinkView = {
  acessoriasEmpresaId: string;
  cnpjExterno: string;
  createdAt: string;
  empresa: AcessoriasCompanySummaryView | null;
  empresaId: string | null;
  id: string;
  matchAutomatico: boolean;
  nomeExterno: string;
  sincronizacaoHabilitada: boolean;
  statusVinculo: StatusAcessoriasEmpresaVinculo;
  ultimaSincronizacaoEm: string | null;
  updatedAt: string;
};

export type AcessoriasCompanyExternalRaw = {
  cnpj?: string | number | null;
  cnpjExterno?: string | number | null;
  codigo?: string | null;
  empresaId?: string | null;
  id?: string | null;
  nome?: string | null;
  nomeFantasia?: string | null;
  razaoSocial?: string | null;
};

export type AcessoriasCompaniesFetchPage = {
  items: AcessoriasCompanyExternalRaw[];
  nextCursor: string | null;
};

export type AcessoriasParcelamentoExternalRaw = {
  atrasado?: boolean | number | string | null;
  codigo?: string | null;
  dataVencimento?: string | null;
  dataVencimentoRelevante?: string | null;
  descricao?: string | null;
  emAtraso?: boolean | number | string | null;
  id?: string | null;
  indicioAtraso?: boolean | number | string | null;
  modalidade?: string | null;
  numeroParcelaAtual?: number | string | null;
  parcelaAtual?: number | string | null;
  parcelamentoId?: string | null;
  proximoVencimento?: string | null;
  quantidadeParcelas?: number | string | null;
  referencia?: string | null;
  requerAcao?: boolean | number | string | null;
  situacao?: string | null;
  status?: string | null;
  tipo?: string | null;
  totalParcelas?: number | string | null;
};

export type AcessoriasParcelamentosFetchResult = {
  items: AcessoriasParcelamentoExternalRaw[];
};

export type AcessoriasCompanySyncSummaryView = {
  atualizados: number;
  criados: number;
  falhas: number;
  ignorados: number;
  pendentes: number;
  processados: number;
  vinculadosAutomaticamente: number;
};

export type AcessoriasCompanySyncResponse = {
  config: AcessoriasConfigView;
  job: AcessoriasJobView;
  message: string;
  summary: AcessoriasCompanySyncSummaryView;
};

export type AcessoriasCompanyLinkInput = {
  acessoriasEmpresaId: string;
};

export type AcessoriasConnectionProbeResult =
  | {
      message: string;
      statusCode: number;
      success: true;
    }
  | {
      message: string;
      statusCode?: number | null;
      success: false;
    };

export type AcessoriasConnectionTestResponse = {
  config: AcessoriasConfigView;
  job: AcessoriasJobView;
  message: string;
  success: boolean;
};

export type AcessoriasCompanyExecutionIntegrationView = {
  createdAt: string;
  empresaId: string;
  id: string;
  mensagemErroAtual: string | null;
  observacoes: string | null;
  statusIntegracao: StatusIntegracao;
  tipoIntegracao: TipoIntegracao;
  ultimaExecucaoEm: string | null;
  updatedAt: string;
  ultimoErroEm: string | null;
  ultimoSucessoEm: string | null;
};

export type AcessoriasCompanyExecutionVarreduraView = {
  createdAt: string;
  empresaId: string;
  finalizadoEm: string | null;
  id: string;
  iniciadoEm: string;
  resumoResultado: string | null;
  statusExecucao: StatusExecucaoVarredura;
  tipoVarredura: TipoVarredura;
  updatedAt: string;
};

export type AcessoriasCompanyExecutionResponse = {
  integration: AcessoriasCompanyExecutionIntegrationView;
  message: string;
  success: boolean;
  varredura: AcessoriasCompanyExecutionVarreduraView;
};
