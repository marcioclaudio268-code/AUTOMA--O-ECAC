import {
  StatusAcessoEmpresa,
  StatusProcuracaoEmpresa
} from '@prisma/client';

export const NON_REGULAR_ACCESS_STATUSES: StatusAcessoEmpresa[] = [
  StatusAcessoEmpresa.BLOQUEADO,
  StatusAcessoEmpresa.INDISPONIVEL,
  StatusAcessoEmpresa.NAO_VERIFICADO
];

export const NON_REGULAR_PROCURACAO_STATUSES: StatusProcuracaoEmpresa[] = [
  StatusProcuracaoEmpresa.INVALIDA,
  StatusProcuracaoEmpresa.NAO_VERIFICADA,
  StatusProcuracaoEmpresa.PENDENTE
];

export function isNonRegularAccessStatus(status: StatusAcessoEmpresa) {
  return NON_REGULAR_ACCESS_STATUSES.includes(status);
}

export function isNonRegularProcuracaoStatus(
  status: StatusProcuracaoEmpresa
) {
  return NON_REGULAR_PROCURACAO_STATUSES.includes(status);
}
