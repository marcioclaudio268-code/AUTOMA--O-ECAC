import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import {
  CompanyIntegrationExecutionAttempt,
  CompanyIntegrationExecutionContext,
  INTEGRA_CONTADOR_CONTRACT_READY_MESSAGE
} from '../company-integration.shared';
import {
  loadIntegraContadorContract,
  INTEGRA_CONTADOR_HTTP_CONTRACT_ENV
} from '../config/integra-contador.contract';

@Injectable()
export class IntegraContadorAdapter {
  constructor(private readonly configService: ConfigService) {}

  async execute(
    context: CompanyIntegrationExecutionContext
  ): Promise<CompanyIntegrationExecutionAttempt> {
    void context;

    const contractState = loadIntegraContadorContract(this.configService);

    if (contractState.state !== 'ready') {
      return {
        message:
          contractState.message ||
          `Integracao INTEGRA_CONTADOR ainda nao configurada no ambiente. Defina ${INTEGRA_CONTADOR_HTTP_CONTRACT_ENV}.`,
        success: false
      };
    }

    return {
      message: INTEGRA_CONTADOR_CONTRACT_READY_MESSAGE,
      success: false
    };
  }
}
