import { Prisma } from '@prisma/client';

import type {
  StatusAcessoEmpresa,
  StatusProcuracaoEmpresa
} from '@prisma/client';

export const TipoPendenciaEnum = {
  ACESSO: 'ACESSO',
  OPERACIONAL: 'OPERACIONAL',
  PROCURACAO: 'PROCURACAO'
} as const;

export type TipoPendencia =
  (typeof TipoPendenciaEnum)[keyof typeof TipoPendenciaEnum];

export const StatusPendenciaEnum = {
  ABERTA: 'ABERTA',
  RESOLVIDA: 'RESOLVIDA'
} as const;

export type StatusPendencia =
  (typeof StatusPendenciaEnum)[keyof typeof StatusPendenciaEnum];

export const PrioridadePendenciaEnum = {
  ALTA: 'ALTA',
  BAIXA: 'BAIXA',
  MEDIA: 'MEDIA'
} as const;

export type PrioridadePendencia =
  (typeof PrioridadePendenciaEnum)[keyof typeof PrioridadePendenciaEnum];

export const CriticidadePendenciaEnum = PrioridadePendenciaEnum;

export type CriticidadePendencia = PrioridadePendencia;

export const PendenciaSortByEnum = {
  ABERTA_EM: 'ABERTA_EM',
  ATUALIZADA_EM: 'ATUALIZADA_EM',
  PRIORIDADE: 'PRIORIDADE',
  STATUS: 'STATUS'
} as const;

export type PendenciaSortBy =
  (typeof PendenciaSortByEnum)[keyof typeof PendenciaSortByEnum];

export const SortDirectionEnum = {
  ASC: 'ASC',
  DESC: 'DESC'
} as const;

export type SortDirection =
  (typeof SortDirectionEnum)[keyof typeof SortDirectionEnum];

export const TipoLogExecucaoEnum = {
  CONFERENCIA_OPERACIONAL: 'CONFERENCIA_OPERACIONAL',
  REGISTRO_PENDENCIA: 'REGISTRO_PENDENCIA',
  REGULARIZACAO_PENDENCIA: 'REGULARIZACAO_PENDENCIA',
  RETIRADA_CARTEIRA: 'RETIRADA_CARTEIRA'
} as const;

export type TipoLogExecucao =
  (typeof TipoLogExecucaoEnum)[keyof typeof TipoLogExecucaoEnum];

export const ResultadoLogExecucaoEnum = {
  FALHA: 'FALHA',
  SEM_ALTERACAO: 'SEM_ALTERACAO',
  SUCESSO: 'SUCESSO'
} as const;

export type ResultadoLogExecucao =
  (typeof ResultadoLogExecucaoEnum)[keyof typeof ResultadoLogExecucaoEnum];

export const SEM_RESPONSAVEL_LABEL = 'Sem responsavel';

export type PendenciaCompanySummary = {
  cnpj: string;
  id: string;
  naCarteira: boolean;
  nomeFantasia: string | null;
  pendenciaOperacional: boolean;
  observacoesOperacionais: string | null;
  razaoSocial: string;
  responsavelInternoId: string | null;
  statusAcesso: StatusAcessoEmpresa;
  statusProcuracao: StatusProcuracaoEmpresa;
  ultimaConferenciaOperacionalEm: string | null;
  regularizadaEm: string | null;
};

export type PendenciaStatusAtual =
  | StatusAcessoEmpresa
  | StatusProcuracaoEmpresa
  | StatusPendencia
  | 'PENDENTE';

export type PendenciaRecord = {
  abertaEm: string;
  atualizadaPorUsuarioInternoId: string | null;
  atualizadaPorUsuarioInternoNome: string | null;
  criadaPorUsuarioInternoId: string | null;
  criadaPorUsuarioInternoNome: string | null;
  createdAt: string;
  descricao: string;
  empresa: PendenciaCompanySummary;
  empresaCnpj: string;
  empresaNome: string;
  empresaNomeFantasia: string | null;
  empresaId: string;
  fechadaEm: string | null;
  id: string;
  linkTratamento: string;
  motivo: string;
  origem: string | null;
  observacaoOperacional: string | null;
  prioridade: PrioridadePendencia;
  criticidade: PrioridadePendencia;
  responsavelInternoId: string | null;
  responsavelInternoNome: string;
  statusAtual: PendenciaStatusAtual;
  status: StatusPendencia;
  tipoPendencia: TipoPendencia;
  titulo: string;
  tipo: TipoPendencia;
  ultimaConferenciaOperacionalEm: string | null;
  updatedAt: string;
};

export type PendenciaListItem = PendenciaRecord;

export type PendenciaItem = PendenciaListItem;

export type PendenciaOperacionalRecord = PendenciaRecord;

export type LogExecucaoRecord = {
  createdAt: string;
  detalhes: string | null;
  empresaId: string;
  empresaNome: string;
  executadoEm: string;
  executadoPorUsuarioInternoId: string | null;
  executadoPorUsuarioInternoNome: string;
  id: string;
  chaveIdempotencia: string | null;
  pendenciaId: string | null;
  pendenciaStatus: StatusPendencia | null;
  pendenciaTipo: TipoPendencia | null;
  pendenciaTitulo: string | null;
  resultado: ResultadoLogExecucao;
  resumo: string;
  tipo: TipoLogExecucao;
};

export type CompanyOperationalSnapshot = {
  cnpj: string;
  empresaId: string;
  empresaNome: string;
  naCarteira: boolean;
  nomeFantasia: string | null;
  observacoesOperacionais: string | null;
  pendenciaOperacional: boolean;
  regularizadaEm: string | null;
  responsavelInternoId: string | null;
  responsavelInternoNome: string | null;
  statusAcesso: StatusAcessoEmpresa;
  statusProcuracao: StatusProcuracaoEmpresa;
  ultimaConferenciaAcessoEm: string | null;
  ultimaConferenciaOperacionalEm: string | null;
  ultimaConferenciaProcuracaoEm: string | null;
  ultimaVarreduraEm: string | null;
  ultimoEventoRelevanteEm: string | null;
  updatedAt: string;
};

export type CompanyOperationalHistory = {
  empresa: CompanyOperationalSnapshot;
  empresaId: string;
  empresaNome: string;
  logs: LogExecucaoRecord[];
  pendencias: PendenciaRecord[];
  pendenciasAbertas: PendenciaRecord[];
  pendenciasEncerradasRecentes: PendenciaRecord[];
  ultimoLog: LogExecucaoRecord | null;
};

export type PendenciaListFilters = {
  empresaId?: string | undefined;
  page?: number | undefined;
  prioridade?: PrioridadePendencia | undefined;
  responsavelInternoId?: string | undefined;
  sortBy?: PendenciaSortBy | undefined;
  sortDirection?: SortDirection | undefined;
  status?: StatusPendencia | undefined;
  tipoPendencia?: TipoPendencia | undefined;
  take?: number | undefined;
};

export type PendenciaCreateInput = {
  descricao?: string | undefined;
  origem?: string | undefined;
  prioridade?: PrioridadePendencia | undefined;
  responsavelInternoId?: string | null | undefined;
  chaveIdempotencia?: string | null | undefined;
  status?: StatusPendencia | undefined;
  tipo?: TipoPendencia | undefined;
  titulo?: string | undefined;
};

export type PendenciaUpdateInput = {
  descricao?: string | undefined;
  origem?: string | undefined;
  prioridade?: PrioridadePendencia | undefined;
  responsavelInternoId?: string | null | undefined;
  status?: StatusPendencia | undefined;
  titulo?: string | undefined;
};

export type CompanyOperationalActionInput = {
  chaveIdempotencia?: string | null | undefined;
  pendenciaId?: string | null | undefined;
};

export type CompanyPendenciaResolveInput = {
  chaveIdempotencia?: string | null | undefined;
};

export type PendenciaQueryWhere = Prisma.PendenciaWhereInput;
