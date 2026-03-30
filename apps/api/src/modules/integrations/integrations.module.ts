import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { CompanyIntegrationsController } from './controllers/company-integrations.controller';
import { CompanyIntegrationsService } from './services/company-integrations.service';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [CompanyIntegrationsController],
  providers: [CompanyIntegrationsService],
  exports: [CompanyIntegrationsService]
})
export class IntegrationsModule {}
