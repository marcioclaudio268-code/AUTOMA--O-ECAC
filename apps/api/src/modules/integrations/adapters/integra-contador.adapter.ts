import { Injectable } from '@nestjs/common';

import {
  CompanyIntegrationExecutionAttempt,
  CompanyIntegrationExecutionContext,
  INTEGRA_CONTADOR_NOT_CONFIGURED_MESSAGE
} from '../company-integration.shared';

@Injectable()
export class IntegraContadorAdapter {
  async execute(
    context: CompanyIntegrationExecutionContext
  ): Promise<CompanyIntegrationExecutionAttempt> {
    void context;

    return {
      message: INTEGRA_CONTADOR_NOT_CONFIGURED_MESSAGE,
      success: false
    };
  }
}
