import { Module } from '@nestjs/common';

import { AcessoriasModule } from './acessorias/acessorias.module';

@Module({
  imports: [AcessoriasModule]
})
export class IntegrationsModule {}
