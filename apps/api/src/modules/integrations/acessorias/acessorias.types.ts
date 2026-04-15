import type {
  StatusAcessoriasSyncJob,
  StatusIntegracaoAcessorias,
  TipoAcessoriasSyncJob
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
