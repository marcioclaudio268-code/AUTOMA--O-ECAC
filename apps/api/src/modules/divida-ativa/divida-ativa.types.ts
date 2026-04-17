import type {
  StatusExecucaoVarredura,
  StatusIntegracao,
  TipoEventoOperacional,
  TipoIntegracao,
  TipoVarredura
} from '@prisma/client';

export type DividaAtivaExternalRaw = {
  acaoNecessaria?: boolean | number | string | null;
  codigo?: string | null;
  dataInscricao?: string | null;
  descricao?: string | null;
  id?: string | null;
  inscricao?: string | null;
  modalidade?: string | null;
  necessidadeConferencia?: boolean | number | string | null;
  numeroInscricao?: string | null;
  pendente?: boolean | number | string | null;
  referencia?: string | null;
  requerAcao?: boolean | number | string | null;
  situacao?: string | null;
  status?: string | null;
  tipo?: string | null;
};

export type DividaAtivaSnapshotInput = {
  dataInscricao: Date | null;
  numeroInscricao: string;
  referenciaExterna: string;
  requerAcao: boolean;
  situacao: string;
  tipoDivida: string;
};

export type DividaAtivaChangeView = {
  referenciaExterna: string;
  resumo: string;
  situacaoAtual: string;
  tipo: 'CRIADA' | 'ATUALIZADA' | 'DESATIVADA' | 'REATIVADA';
};

export type DividaAtivaSyncResult = {
  activeCount: number;
  actionableCount: number;
  changes: DividaAtivaChangeView[];
  createdCount: number;
  deactivatedCount: number;
  eventDescription: string | null;
  eventMetadata: Record<string, unknown> | null;
  eventType: TipoEventoOperacional | null;
  hasRelevantChange: boolean;
  logDetails: string;
  logSummary: string;
  pendingDescription: string | null;
  pendingRequired: boolean;
  pendingTitle: string | null;
  resumoResultado: string;
  semOcorrencia: boolean;
  snapshots: DividaAtivaSnapshotInput[];
  updatedCount: number;
};

export type DividaAtivaExecutionIntegrationView = {
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

export type DividaAtivaExecutionVarreduraView = {
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

export type DividaAtivaExecutionResponse = {
  integration: DividaAtivaExecutionIntegrationView;
  message: string;
  success: boolean;
  summary: {
    activeCount: number;
    actionableCount: number;
    createdCount: number;
    deactivatedCount: number;
    semOcorrencia: boolean;
    updatedCount: number;
  };
  varredura: DividaAtivaExecutionVarreduraView;
};
