import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { PendenciasController } from './pendencias.controller';
import { PendenciasService } from './pendencias.service';

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [PendenciasController],
  providers: [PendenciasService]
})
export class PendenciasModule {}
