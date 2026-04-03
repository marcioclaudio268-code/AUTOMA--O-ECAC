import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { PendenciasController } from './pendencias.controller';
import { PendenciasService } from './pendencias.service';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [PendenciasController],
  providers: [PendenciasService],
  exports: [PendenciasService]
})
export class PendenciasModule {}
