import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { PendenciasModule } from '../pendencias/pendencias.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { CompaniesOperationalController } from './companies-operational.controller';
import { CompaniesController } from './companies.controller';
import { CompaniesService } from './companies.service';

@Module({
  imports: [PrismaModule, AuthModule, PendenciasModule],
  controllers: [CompaniesController, CompaniesOperationalController],
  providers: [CompaniesService],
  exports: [CompaniesService]
})
export class CompaniesModule {}
