import {
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

export const SEM_RESPONSAVEL_LABEL = 'Sem responsável';

export type PendenciaStatusAtual =
  | StatusAcessoEmpresa
  | StatusProcuracaoEmpresa
  | 'PENDENTE';

export type PendenciaItem = {
  empresaCnpj: string;
  empresaId: string;
  empresaNome: string;
  empresaNomeFantasia: string | null;
  linkTratamento: string;
  motivo: string;
  observacaoOperacional: string | null;
  responsavelInternoId: string | null;
  responsavelInternoNome: string;
  statusAtual: PendenciaStatusAtual;
  tipoPendencia: TipoPendencia;
  ultimaConferenciaOperacionalEm: Date | null;
};
