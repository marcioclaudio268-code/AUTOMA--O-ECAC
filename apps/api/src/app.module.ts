import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AppController } from './app.controller';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { CompaniesModule } from './modules/companies/companies.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { CompetenciasModule } from './modules/competencias/competencias.module';
import { DividaAtivaModule } from './modules/divida-ativa/divida-ativa.module';
import { EvidenciasModule } from './modules/evidencias/evidencias.module';
import { EventsModule } from './modules/events/events.module';
import { IntegrationsModule } from './modules/integrations/integrations.module';
import { LogsModule } from './modules/logs/logs.module';
import { ParcelamentosModule } from './modules/parcelamentos/parcelamentos.module';
import { PendenciasModule } from './modules/pendencias/pendencias.module';
import { ResponsaveisModule } from './modules/responsaveis/responsaveis.module';
import { ScansModule } from './modules/scans/scans.module';
import { TarefasModule } from './modules/tarefas/tarefas.module';
import { UsersModule } from './modules/users/users.module';

const featureModules = [
  AuthModule,
  UsersModule,
  CompaniesModule,
  DashboardModule,
  ResponsaveisModule,
  IntegrationsModule,
  ScansModule,
  EventsModule,
  PendenciasModule,
  ParcelamentosModule,
  DividaAtivaModule,
  CompetenciasModule,
  TarefasModule,
  EvidenciasModule,
  LogsModule
];

@Module({
  imports: [
    ConfigModule.forRoot({
      envFilePath: ['../../.env.local', '../../.env'],
      isGlobal: true
    }),
    PrismaModule,
    ...featureModules
  ],
  controllers: [AppController]
})
export class AppModule {}
