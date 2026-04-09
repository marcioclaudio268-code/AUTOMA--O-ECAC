import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { CompanyPendenciasController } from './company-pendencias.controller';
import { PendenciasController } from './pendencias.controller';
import { PendenciasService } from './pendencias.service';

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [PendenciasController, CompanyPendenciasController],
  providers: [PendenciasService],
  exports: [PendenciasService]
})
export class PendenciasModule {}
