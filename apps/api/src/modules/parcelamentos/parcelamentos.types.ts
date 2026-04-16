import type { TipoEventoOperacional } from '@prisma/client';

export type ParcelamentoSnapshotInput = {
  dataVencimentoRelevante: Date | null;
  indicioAtraso: boolean;
  modalidade: string;
  parcelaAtual: number | null;
  quantidadeParcelas: number | null;
  referenciaExterna: string;
  requerAcao: boolean;
  situacao: string;
};

export type ParcelamentoChangeView = {
  referenciaExterna: string;
  resumo: string;
  situacaoAtual: string;
  tipo: 'CRIADO' | 'ATUALIZADO' | 'DESATIVADO' | 'REATIVADO';
};

export type ParcelamentoSyncResult = {
  activeCount: number;
  actionableCount: number;
  changes: ParcelamentoChangeView[];
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
  updatedCount: number;
};
