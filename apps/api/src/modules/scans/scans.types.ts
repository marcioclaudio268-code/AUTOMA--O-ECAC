import { Prisma, StatusExecucaoVarredura, TipoVarredura } from '@prisma/client';

export type ScanCompany = Prisma.EmpresaGetPayload<{
  select: {
    id: true;
    observacoesOperacionais: true;
    pendenciaOperacional: true;
    statusAcesso: true;
    statusProcuracao: true;
  };
}>;

export type ScanRecord = Prisma.VarreduraGetPayload<{
  select: {
    createdAt: true;
    empresaId: true;
    finalizadoEm: true;
    id: true;
    iniciadoEm: true;
    resumoResultado: true;
    statusExecucao: true;
    tipoVarredura: true;
    updatedAt: true;
  };
}>;

export type ManualScanExecutionResult = {
  varredura: ScanRecord;
};

export type ScanSummary = {
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
