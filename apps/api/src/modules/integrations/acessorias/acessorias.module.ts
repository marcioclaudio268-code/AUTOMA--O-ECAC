import { Module } from '@nestjs/common';

import { AuthModule } from '../../auth/auth.module';
import { LogsModule } from '../../logs/logs.module';
import { ParcelamentosModule } from '../../parcelamentos/parcelamentos.module';
import { PrismaModule } from '../../../prisma/prisma.module';

import { AcessoriasController } from './acessorias.controller';
import { AcessoriasService } from './acessorias.service';
import { AcessoriasConfigService } from './services/acessorias-config.service';
import { AcessoriasEmpresasService } from './services/acessorias-empresas.service';
import { AcessoriasConnectorService } from './services/acessorias-connector.service';
import { AcessoriasJobsService } from './services/acessorias-jobs.service';

@Module({
  controllers: [AcessoriasController],
  exports: [
    AcessoriasConfigService,
    AcessoriasConnectorService,
    AcessoriasEmpresasService,
    AcessoriasJobsService,
    AcessoriasService
  ],
  imports: [AuthModule, LogsModule, ParcelamentosModule, PrismaModule],
  providers: [
    AcessoriasConfigService,
    AcessoriasEmpresasService,
    AcessoriasConnectorService,
    AcessoriasJobsService,
    AcessoriasService
  ]
})
export class AcessoriasModule {}
