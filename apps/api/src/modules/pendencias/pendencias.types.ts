import {
  StatusAcessoEmpresa,
  StatusProcuracaoEmpresa
} from '@prisma/client';

export type TipoPendencia = 'ACESSO' | 'OPERACIONAL' | 'PROCURACAO';

export type StatusAtualPendencia =
  | StatusAcessoEmpresa
  | StatusProcuracaoEmpresa
  | 'PENDENTE';

export type PendenciaListItem = {
  empresaCnpj: string;
  empresaId: string;
  empresaNome: string;
  empresaNomeFantasia: string | null;
  linkTratamento: string;
  motivo: string;
  observacaoOperacional: string | null;
  responsavelInternoId: string | null;
  responsavelInternoNome: string;
  statusAtual: StatusAtualPendencia;
  tipoPendencia: TipoPendencia;
  ultimaConferenciaOperacionalEm: string | null;
};
