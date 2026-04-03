import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { IntegraContadorAdapter } from './adapters/integra-contador.adapter';
import { CompanyIntegrationsController } from './controllers/company-integrations.controller';
import { IntegraContadorAuthService } from './services/integra-contador-auth.service';
import { IntegraContadorHttpService } from './services/integra-contador-http.service';
import { CompanyIntegrationExecutionService } from './services/company-integration-execution.service';
import { CompanyIntegrationsService } from './services/company-integrations.service';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [CompanyIntegrationsController],
  providers: [
    CompanyIntegrationsService,
    CompanyIntegrationExecutionService,
    IntegraContadorAuthService,
    IntegraContadorHttpService,
    IntegraContadorAdapter
  ],
  exports: [CompanyIntegrationsService, CompanyIntegrationExecutionService]
})
export class IntegrationsModule {}
