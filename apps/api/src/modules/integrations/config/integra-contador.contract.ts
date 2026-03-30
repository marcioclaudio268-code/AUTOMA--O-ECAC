import { ConfigService } from '@nestjs/config';
import { z } from 'zod';

import {
  INTEGRA_CONTADOR_CONTRACT_LOADED_MESSAGE,
  INTEGRA_CONTADOR_NOT_CONFIGURED_MESSAGE
} from '../company-integration.shared';

export const INTEGRA_CONTADOR_HTTP_CONTRACT_ENV =
  'INTEGRA_CONTADOR_HTTP_CONTRACT_JSON';

const contractDocumentSchema = z.record(z.string(), z.unknown());

export type IntegraContadorContractState =
  | {
      message: string;
      status: 'configured';
    }
  | {
      message: string;
      status: 'invalid';
    }
  | {
      message: string;
      status: 'missing';
    };

export function loadIntegraContadorContract(
  configService: ConfigService
): IntegraContadorContractState {
  const rawContract = configService.get<string>(
    INTEGRA_CONTADOR_HTTP_CONTRACT_ENV
  );

  if (!rawContract?.trim()) {
    return {
      message: INTEGRA_CONTADOR_NOT_CONFIGURED_MESSAGE,
      status: 'missing'
    };
  }

  try {
    const parsedContract = JSON.parse(rawContract) as unknown;
    contractDocumentSchema.parse(parsedContract);
  } catch {
    return {
      message: `Configuracao de INTEGRA_CONTADOR invalida. Revise ${INTEGRA_CONTADOR_HTTP_CONTRACT_ENV}.`,
      status: 'invalid'
    };
  }

  return {
    message: INTEGRA_CONTADOR_CONTRACT_LOADED_MESSAGE,
    status: 'configured'
  };
}
