import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import {
  CompanyIntegrationExecutionAttempt,
  CompanyIntegrationExecutionContext,
  CompanyIntegrationExecutionInput,
  INTEGRA_CONTADOR_PROCURACOES_SERVICE_ID,
  INTEGRA_CONTADOR_PROCURACOES_SYSTEM_ID,
  INTEGRA_CONTADOR_PROCURACOES_SYSTEM_VERSION
} from '../company-integration.shared';
import {
  loadIntegraContadorConfig,
  type IntegraContadorConfig
} from '../config/integra-contador.config';
import {
  normalizeDocumentNumber,
  resolvePessoaTipoCodigo,
  resolvePessoaTipoString
} from '../utils/integra-contador-documents';
import {
  IntegraContadorAuthService
} from '../services/integra-contador-auth.service';
import {
  IntegraContadorHttpError,
  IntegraContadorHttpService
} from '../services/integra-contador-http.service';

@Injectable()
export class IntegraContadorAdapter {
  constructor(
    private readonly authService: IntegraContadorAuthService,
    private readonly configService: ConfigService,
    private readonly httpService: IntegraContadorHttpService
  ) {}

  async execute(
    context: CompanyIntegrationExecutionContext,
    input: CompanyIntegrationExecutionInput
  ): Promise<CompanyIntegrationExecutionAttempt> {
    const configState = loadIntegraContadorConfig(this.configService);

    if (!configState.ready) {
      return {
        message: configState.message,
        success: false
      };
    }

    try {
      const tokens = await this.authService.authenticate(configState.config);
      const payload = buildConsultarPayload(configState.config, input);
      const response = await this.httpService.request(configState.config, {
        body: JSON.stringify(payload),
        headers: {
          Authorization: `Bearer ${tokens.accessToken}`,
          'Content-Type': 'application/json',
          jwt_token: tokens.jwtToken
        },
        method: 'POST',
        url: configState.config.consultarUrl
      });

      return mapConsultationResponse(context, input, response);
    } catch (error) {
      return {
        message: mapExecutionError(error),
        success: false
      };
    }
  }
}

type IntegraContadorDocumentoPayload = {
  numero: string;
  tipo: 1 | 2;
};

type IntegraContadorProcuracaoRequestBody = {
  autorPedidoDados: IntegraContadorDocumentoPayload;
  contratante: IntegraContadorDocumentoPayload;
  contribuinte: IntegraContadorDocumentoPayload;
  pedidoDados: {
    dados: string;
    idServico: typeof INTEGRA_CONTADOR_PROCURACOES_SERVICE_ID;
    idSistema: typeof INTEGRA_CONTADOR_PROCURACOES_SYSTEM_ID;
    versaoSistema: typeof INTEGRA_CONTADOR_PROCURACOES_SYSTEM_VERSION;
  };
};

type IntegraContadorMensagemNegocio = {
  codigo: string | undefined;
  texto: string | undefined;
};

type IntegraContadorConsultResponse = {
  codigoMensagem: string | undefined;
  dados: unknown[] | null | undefined;
  error: string | undefined;
  errorDescription: string | undefined;
  mensagem: string | undefined;
  mensagemPrincipal: string | undefined;
  mensagens: IntegraContadorMensagemNegocio[] | null | undefined;
  message: string | undefined;
  status: number | undefined;
  sucesso: boolean | undefined;
};

function buildDocumentoPayload(
  numero: string,
  tipo?: 'CPF' | 'CNPJ'
): IntegraContadorDocumentoPayload {
  const normalizedNumero = normalizeDocumentNumber(numero);

  return {
    numero: normalizedNumero,
    tipo: resolvePessoaTipoCodigo(normalizedNumero, tipo)
  };
}

function buildConsultarPayload(
  config: IntegraContadorConfig,
  input: CompanyIntegrationExecutionInput
): IntegraContadorProcuracaoRequestBody {
  const outorgante = buildDocumentoPayload(
    input.outorgante,
    input.tipoOutorgante
  );
  const outorgado = buildDocumentoPayload(input.outorgado, input.tipoOutorgado);

  return {
    autorPedidoDados: {
      numero: config.contratanteNumero,
      tipo: config.contratanteTipo
    },
    contratante: {
      numero: config.contratanteNumero,
      tipo: config.contratanteTipo
    },
    contribuinte: outorgante,
    pedidoDados: {
      dados: JSON.stringify({
        outorgante: outorgante.numero,
        tipoOutorgante: resolvePessoaTipoString(
          outorgante.numero,
          input.tipoOutorgante
        ),
        outorgado: outorgado.numero,
        tipoOutorgado: resolvePessoaTipoString(
          outorgado.numero,
          input.tipoOutorgado
        )
      }),
      idServico: INTEGRA_CONTADOR_PROCURACOES_SERVICE_ID,
      idSistema: INTEGRA_CONTADOR_PROCURACOES_SYSTEM_ID,
      versaoSistema: INTEGRA_CONTADOR_PROCURACOES_SYSTEM_VERSION
    }
  };
}

function isBusinessErrorCode(code: string | undefined): boolean {
  if (!code) {
    return false;
  }

  return (
    code.startsWith('AcessoNegado-PROCURACOES-40300') ||
    code.startsWith('ICGERENCIADOR-')
  );
}

function normalizeBusinessCode(code: string | undefined): string | undefined {
  if (!code) {
    return undefined;
  }

  const trimmed = code.trim();

  if (!trimmed) {
    return undefined;
  }

  return trimmed.replace(/^\[|\]$/g, '');
}

function extractBusinessMessage(
  response: IntegraContadorConsultResponse
): { code: string | undefined; text: string | undefined } {
  const messages = response.mensagens ?? [];

  const firstRelevantMessage = messages.find((message) => {
    const code = normalizeBusinessCode(message.codigo);
    return Boolean(code && isBusinessErrorCode(code));
  });

  const message = firstRelevantMessage ?? messages[0];

  return {
    code: normalizeBusinessCode(
      message?.codigo ?? response.codigoMensagem ?? undefined
    ),
    text:
      message?.texto?.trim() ||
      response.mensagemPrincipal?.trim() ||
      response.mensagem?.trim() ||
      response.message?.trim() ||
      response.errorDescription?.trim() ||
      response.error?.trim()
  };
}

function normalizeMensagemNegocio(
  value: unknown
): IntegraContadorMensagemNegocio {
  if (!value || typeof value !== 'object') {
    return {
      codigo: undefined,
      texto: undefined
    };
  }

  const candidate = value as Record<string, unknown>;

  return {
    codigo:
      typeof candidate.codigo === 'string' ? candidate.codigo : undefined,
    texto: typeof candidate.texto === 'string' ? candidate.texto : undefined
  };
}

function buildSuccessMessage(response: IntegraContadorConsultResponse): string {
  const count = Array.isArray(response.dados) ? response.dados.length : null;

  if (count !== null) {
    return `Consulta de procuracoes concluida com sucesso. Registros retornados: ${count}.`;
  }

  return 'Consulta de procuracoes concluida com sucesso.';
}

function buildFailureMessage(
  statusCode: number,
  response: IntegraContadorConsultResponse
): string {
  const { code, text } = extractBusinessMessage(response);
  const codeFragment = code ? (text ? `${code}: ${text}` : code) : text;

  if (statusCode === 401) {
    return codeFragment
      ? `Autenticacao do Integra Contador invalida ou expirada. ${codeFragment}`
      : 'Autenticacao do Integra Contador invalida ou expirada.';
  }

  if (statusCode === 403) {
    if (code === 'AcessoNegado-PROCURACOES-40300' && text) {
      return `${code}: ${text}`;
    }

    return codeFragment
      ? `Acesso negado pelo Integra Contador. ${codeFragment}`
      : 'Acesso negado pelo Integra Contador.';
  }

  if (statusCode === 400) {
    return codeFragment
      ? `Entrada invalida para PROCURACOES / OBTERPROCURACAO41. ${codeFragment}`
      : 'Entrada invalida para PROCURACOES / OBTERPROCURACAO41.';
  }

  if (statusCode === 429) {
    return codeFragment
      ? `Limite de requisicoes do Integra Contador atingido. ${codeFragment}`
      : 'Limite de requisicoes do Integra Contador atingido.';
  }

  if (statusCode === 500 || statusCode === 503) {
    return codeFragment
      ? `Falha ou indisponibilidade do Integra Contador. ${codeFragment}`
      : 'Falha ou indisponibilidade do Integra Contador.';
  }

  if (codeFragment) {
    return codeFragment;
  }

  return `Falha na consulta de procuracoes do Integra Contador (status ${statusCode}).`;
}

function mapConsultationResponse(
  context: CompanyIntegrationExecutionContext,
  input: CompanyIntegrationExecutionInput,
  response: { body: unknown; rawBody: string; statusCode: number }
): CompanyIntegrationExecutionAttempt {
  void context;
  void input;

  const parsed = normalizeConsultResponseBody(response.body);

  if (response.statusCode < 200 || response.statusCode >= 300) {
    return {
      message: buildFailureMessage(response.statusCode, parsed),
      success: false
    };
  }

  if (parsed.sucesso === false) {
    return {
      message: buildFailureMessage(response.statusCode, parsed),
      success: false
    };
  }

  const { code } = extractBusinessMessage(parsed);

  if (isBusinessErrorCode(code)) {
    return {
      message: buildFailureMessage(response.statusCode, parsed),
      success: false
    };
  }

  return {
    message: buildSuccessMessage(parsed),
    success: true
  };
}

function normalizeConsultResponseBody(
  body: unknown
): IntegraContadorConsultResponse {
  if (typeof body === 'string') {
    return {
      codigoMensagem: undefined,
      dados: undefined,
      error: undefined,
      errorDescription: undefined,
      mensagem: undefined,
      mensagemPrincipal: undefined,
      mensagens: undefined,
      message: body,
      status: undefined,
      sucesso: undefined
    };
  }

  if (!body || typeof body !== 'object') {
    return {
      codigoMensagem: undefined,
      dados: undefined,
      error: undefined,
      errorDescription: undefined,
      mensagem: undefined,
      mensagemPrincipal: undefined,
      mensagens: undefined,
      message: undefined,
      status: undefined,
      sucesso: undefined
    };
  }

  const candidate = body as Record<string, unknown>;

  return {
    codigoMensagem:
      typeof candidate.codigoMensagem === 'string'
        ? candidate.codigoMensagem
        : undefined,
    dados: Array.isArray(candidate.dados)
      ? (candidate.dados as unknown[])
      : undefined,
    error: typeof candidate.error === 'string' ? candidate.error : undefined,
    errorDescription:
      typeof candidate.error_description === 'string'
        ? candidate.error_description
        : typeof candidate.errorDescription === 'string'
          ? candidate.errorDescription
          : undefined,
    mensagemPrincipal:
      typeof candidate.mensagemPrincipal === 'string'
        ? candidate.mensagemPrincipal
        : undefined,
    mensagem:
      typeof candidate.mensagem === 'string' ? candidate.mensagem : undefined,
    mensagens: Array.isArray(candidate.mensagens)
      ? candidate.mensagens.map((item) => normalizeMensagemNegocio(item))
      : undefined,
    message:
      typeof candidate.message === 'string' ? candidate.message : undefined,
    status:
      typeof candidate.status === 'number' ? candidate.status : undefined,
    sucesso:
      typeof candidate.sucesso === 'boolean' ? candidate.sucesso : undefined
  };
}

function mapExecutionError(error: unknown): string {
  if (error instanceof IntegraContadorHttpError) {
    return buildFailureMessage(
      error.statusCode,
      normalizeConsultResponseBody(error.body)
    );
  }

  if (error instanceof Error) {
    return error.message || 'Falha inesperada na integracao Integra Contador.';
  }

  return 'Falha inesperada na integracao Integra Contador.';
}
