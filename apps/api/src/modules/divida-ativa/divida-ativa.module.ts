import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { LogsModule } from '../logs/logs.module';
import { AcessoriasModule } from '../integrations/acessorias/acessorias.module';
import { PrismaModule } from '../../prisma/prisma.module';

import { DividaAtivaController } from './controllers/divida-ativa.controller';
import { DividaAtivaService } from './services/divida-ativa.service';

@Module({
  controllers: [DividaAtivaController],
  exports: [DividaAtivaService],
  imports: [AuthModule, AcessoriasModule, LogsModule, PrismaModule],
  providers: [DividaAtivaService]
})
export class DividaAtivaModule {}
