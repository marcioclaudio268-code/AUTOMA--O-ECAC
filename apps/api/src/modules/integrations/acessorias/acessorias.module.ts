import { Module } from '@nestjs/common';

import { AuthModule } from '../../auth/auth.module';
import { PrismaModule } from '../../../prisma/prisma.module';

import { AcessoriasController } from './acessorias.controller';
import { AcessoriasService } from './acessorias.service';
import { AcessoriasConfigService } from './services/acessorias-config.service';
import { AcessoriasConnectorService } from './services/acessorias-connector.service';
import { AcessoriasJobsService } from './services/acessorias-jobs.service';

@Module({
  controllers: [AcessoriasController],
  exports: [
    AcessoriasConfigService,
    AcessoriasConnectorService,
    AcessoriasJobsService,
    AcessoriasService
  ],
  imports: [AuthModule, PrismaModule],
  providers: [
    AcessoriasConfigService,
    AcessoriasConnectorService,
    AcessoriasJobsService,
    AcessoriasService
  ]
})
export class AcessoriasModule {}
