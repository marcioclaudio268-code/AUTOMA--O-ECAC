import fs from 'node:fs';
import path from 'node:path';

import { ConfigService } from '@nestjs/config';

import {
  isValidDocumentNumber,
  normalizeDocumentNumber,
  resolvePessoaTipoCodigo
} from '../utils/integra-contador-documents';

export const INTEGRA_CONTADOR_CONSUMER_KEY_ENV =
  'INTEGRA_CONTADOR_CONSUMER_KEY';
export const INTEGRA_CONTADOR_CONSUMER_SECRET_ENV =
  'INTEGRA_CONTADOR_CONSUMER_SECRET';
export const INTEGRA_CONTADOR_CERT_PATH_ENV = 'INTEGRA_CONTADOR_CERT_PATH';
export const INTEGRA_CONTADOR_CERT_PASSWORD_ENV =
  'INTEGRA_CONTADOR_CERT_PASSWORD';
export const INTEGRA_CONTADOR_CONTRATANTE_NUMERO_ENV =
  'INTEGRA_CONTADOR_CONTRATANTE_NUMERO';

export const INTEGRA_CONTADOR_AUTH_URL =
  'https://autenticacao.sapi.serpro.gov.br/authenticate';
export const INTEGRA_CONTADOR_CONSULTAR_URL =
  'https://gateway.apiserpro.serpro.gov.br/integra-contador/v1/Consultar';

export type IntegraContadorConfig = {
  authUrl: string;
  certPassword: string;
  certPfx: Buffer;
  consultarUrl: string;
  contratanteNumero: string;
  contratanteTipo: 1 | 2;
  consumerKey: string;
  consumerSecret: string;
};

export type IntegraContadorConfigLoadResult =
  | {
      config: null;
      message: string;
      ready: false;
    }
  | {
      config: IntegraContadorConfig;
      message: string;
      ready: true;
    };

function readRequiredEnv(
  configService: ConfigService,
  envName: string
): string | null {
  const value = configService.get<string>(envName);

  if (!value || !value.trim()) {
    return null;
  }

  return value;
}

function readCertificatePfx(certPath: string): Buffer {
  const resolvedPath = path.isAbsolute(certPath)
    ? certPath
    : path.resolve(process.cwd(), certPath);

  if (!fs.existsSync(resolvedPath)) {
    throw new Error(
      `Certificado do Integra Contador nao encontrado em ${resolvedPath}.`
    );
  }

  return fs.readFileSync(resolvedPath);
}

export function loadIntegraContadorConfig(
  configService: ConfigService
): IntegraContadorConfigLoadResult {
  const consumerKey = readRequiredEnv(
    configService,
    INTEGRA_CONTADOR_CONSUMER_KEY_ENV
  );

  if (!consumerKey) {
    return {
      config: null,
      message: `Integra Contador sem configuracao: defina ${INTEGRA_CONTADOR_CONSUMER_KEY_ENV}.`,
      ready: false
    };
  }

  const consumerSecret = readRequiredEnv(
    configService,
    INTEGRA_CONTADOR_CONSUMER_SECRET_ENV
  );

  if (!consumerSecret) {
    return {
      config: null,
      message: `Integra Contador sem configuracao: defina ${INTEGRA_CONTADOR_CONSUMER_SECRET_ENV}.`,
      ready: false
    };
  }

  const certPath = readRequiredEnv(
    configService,
    INTEGRA_CONTADOR_CERT_PATH_ENV
  );

  if (!certPath) {
    return {
      config: null,
      message: `Integra Contador sem configuracao: defina ${INTEGRA_CONTADOR_CERT_PATH_ENV}.`,
      ready: false
    };
  }

  const certPassword = readRequiredEnv(
    configService,
    INTEGRA_CONTADOR_CERT_PASSWORD_ENV
  );

  if (!certPassword) {
    return {
      config: null,
      message: `Integra Contador sem configuracao: defina ${INTEGRA_CONTADOR_CERT_PASSWORD_ENV}.`,
      ready: false
    };
  }

  const contratanteNumero = readRequiredEnv(
    configService,
    INTEGRA_CONTADOR_CONTRATANTE_NUMERO_ENV
  );

  if (!contratanteNumero) {
    return {
      config: null,
      message: `Integra Contador sem configuracao: defina ${INTEGRA_CONTADOR_CONTRATANTE_NUMERO_ENV}.`,
      ready: false
    };
  }

  const normalizedContratanteNumero = normalizeDocumentNumber(
    contratanteNumero
  );

  if (!isValidDocumentNumber(normalizedContratanteNumero)) {
    return {
      config: null,
      message: `${INTEGRA_CONTADOR_CONTRATANTE_NUMERO_ENV} deve conter 11 ou 14 digitos.`,
      ready: false
    };
  }

  try {
    return {
      config: {
        authUrl: INTEGRA_CONTADOR_AUTH_URL,
        certPassword,
        certPfx: readCertificatePfx(certPath.trim()),
        consultarUrl: INTEGRA_CONTADOR_CONSULTAR_URL,
        contratanteNumero: normalizedContratanteNumero,
        contratanteTipo: resolvePessoaTipoCodigo(normalizedContratanteNumero),
        consumerKey,
        consumerSecret
      },
      message: 'Integra Contador configurado para execucao real de procuracoes.',
      ready: true
    };
  } catch (error) {
    return {
      config: null,
      message:
        error instanceof Error
          ? error.message
          : 'Falha ao carregar o certificado do Integra Contador.',
      ready: false
    };
  }
}
