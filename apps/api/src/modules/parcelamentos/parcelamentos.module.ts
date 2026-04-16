import { Module } from '@nestjs/common';

import { ParcelamentosService } from './parcelamentos.service';

@Module({
  providers: [ParcelamentosService],
  exports: [ParcelamentosService]
})
export class ParcelamentosModule {}
