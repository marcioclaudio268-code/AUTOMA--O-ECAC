import { ConfigService } from '@nestjs/config';
import { z } from 'zod';

import {
  INTEGRA_CONTADOR_CONTRACT_INVALID_MESSAGE,
  INTEGRA_CONTADOR_NOT_CONFIGURED_MESSAGE,
  INTEGRA_CONTADOR_CONTRACT_READY_MESSAGE
} from '../company-integration.shared';

export const INTEGRA_CONTADOR_HTTP_CONTRACT_ENV =
  'INTEGRA_CONTADOR_HTTP_CONTRACT_JSON';

export const INTEGRA_CONTADOR_HTTP_CONTRACT_DOCUMENT =
  'docs/integracoes/integra-contador-http-contract.md';

const httpMethodSchema = z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);
const authKindSchema = z.enum(['none', 'basic', 'bearer', 'apiKey']);

const integraContadorContractSchema = z
  .object({
    http: z
      .object({
        auth: z
          .object({
            envVarName: z.string().min(1).nullable(),
            headerName: z.string().min(1).nullable(),
            kind: authKindSchema.nullable(),
            tokenPrefix: z.string().min(1).nullable()
          })
          .strict(),
        baseUrl: z.string().url().nullable(),
        headers: z.record(z.string().min(1), z.string()).default({}),
        method: httpMethodSchema.nullable(),
        path: z.string().min(1).nullable(),
        request: z
          .object({
            bodyDescription: z.string().min(1).nullable(),
            pathParameters: z.array(z.string().min(1)),
            queryParameters: z.array(z.string().min(1))
          })
          .strict(),
        response: z
          .object({
            failureDescription: z.string().min(1).nullable(),
            successDescription: z.string().min(1).nullable()
          })
          .strict(),
        timeoutMs: z.number().int().positive().nullable()
      })
      .strict(),
    missing: z.array(z.string().min(1)),
    sourceDocument: z.string().min(1),
    specVersion: z.literal(1),
    status: z.enum(['blocked', 'partial', 'ready']),
    summary: z.string().min(1)
  })
  .strict()
  .superRefine((contract, ctx) => {
    if (contract.sourceDocument !== INTEGRA_CONTADOR_HTTP_CONTRACT_DOCUMENT) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `sourceDocument deve apontar para ${INTEGRA_CONTADOR_HTTP_CONTRACT_DOCUMENT}.`
      });
    }

    if (contract.status === 'ready') {
      if (contract.missing.length > 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            'Contrato marcado como ready nao pode conter campos pendentes.'
        });
      }

      return;
    }

    if (contract.missing.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'Contrato bloqueado ou parcial precisa declarar ao menos um campo pendente.'
      });
    }
  });

export type IntegraContadorContractDocument = z.infer<
  typeof integraContadorContractSchema
>;

export type IntegraContadorContractLoadResult =
  | {
      contract: null;
      message: string;
      missingFields: string[];
      ready: false;
      state: 'invalid';
    }
  | {
      contract: null;
      message: string;
      missingFields: string[];
      ready: false;
      state: 'missing';
    }
  | {
      contract: IntegraContadorContractDocument;
      message: string;
      missingFields: string[];
      ready: false;
      state: 'blocked';
    }
  | {
      contract: IntegraContadorContractDocument;
      message: string;
      missingFields: [];
      ready: true;
      state: 'ready';
    };

function normalizeMissingFields(missingFields: string[]): string[] {
  return Array.from(
    new Set(
      missingFields.map((field) => field.trim()).filter((field) => field.length > 0)
    )
  );
}

function buildBlockedMessage(missingFields: string[]): string {
  return `Integracao INTEGRA_CONTADOR ainda incompleta. Campos pendentes: ${missingFields.join(', ')}. Consulte ${INTEGRA_CONTADOR_HTTP_CONTRACT_DOCUMENT} e ajuste ${INTEGRA_CONTADOR_HTTP_CONTRACT_ENV}.`;
}

export function loadIntegraContadorContract(
  configService: ConfigService
): IntegraContadorContractLoadResult {
  const rawContract = configService.get<string>(
    INTEGRA_CONTADOR_HTTP_CONTRACT_ENV
  );

  if (!rawContract?.trim()) {
    return {
      contract: null,
      message: INTEGRA_CONTADOR_NOT_CONFIGURED_MESSAGE,
      missingFields: [],
      ready: false,
      state: 'missing'
    };
  }

  let parsedContract: unknown;

  try {
    parsedContract = JSON.parse(rawContract);
  } catch {
    return {
      contract: null,
      message: `${INTEGRA_CONTADOR_CONTRACT_INVALID_MESSAGE} Revise ${INTEGRA_CONTADOR_HTTP_CONTRACT_ENV} e consulte ${INTEGRA_CONTADOR_HTTP_CONTRACT_DOCUMENT}.`,
      missingFields: [],
      ready: false,
      state: 'invalid'
    };
  }

  const validation = integraContadorContractSchema.safeParse(parsedContract);

  if (!validation.success) {
    return {
      contract: null,
      message: `${INTEGRA_CONTADOR_CONTRACT_INVALID_MESSAGE} Revise ${INTEGRA_CONTADOR_HTTP_CONTRACT_ENV} e consulte ${INTEGRA_CONTADOR_HTTP_CONTRACT_DOCUMENT}.`,
      missingFields: [],
      ready: false,
      state: 'invalid'
    };
  }

  const contract = validation.data;
  const missingFields = normalizeMissingFields(contract.missing);

  if (contract.status === 'ready') {
    if (missingFields.length > 0) {
      return {
        contract: null,
        message: `Configuracao de INTEGRA_CONTADOR inconsistente. Campos pendentes nao podem existir quando o status e ready: ${missingFields.join(', ')}. Consulte ${INTEGRA_CONTADOR_HTTP_CONTRACT_DOCUMENT}.`,
        missingFields: [],
        ready: false,
        state: 'invalid'
      };
    }

    return {
      contract,
      message: INTEGRA_CONTADOR_CONTRACT_READY_MESSAGE,
      missingFields: [],
      ready: true,
      state: 'ready'
    };
  }

  if (missingFields.length === 0) {
    return {
      contract: null,
      message:
        `Configuracao de INTEGRA_CONTADOR inconsistente. Status bloqueado ou parcial exige lista de campos pendentes. Consulte ${INTEGRA_CONTADOR_HTTP_CONTRACT_DOCUMENT}.`,
      missingFields: [],
      ready: false,
      state: 'invalid'
    };
  }

  return {
    contract,
    message: buildBlockedMessage(missingFields),
    missingFields,
    ready: false,
    state: 'blocked'
  };
}
