import { Controller, Get, Query, UseGuards } from '@nestjs/common';

import { JwtCookieAuthGuard } from '../auth/guards/jwt-cookie-auth.guard';
import { ListPendenciasQueryDto } from './dto/list-pendencias-query.dto';
import { PendenciasService } from './pendencias.service';
import { PendenciaItem } from './pendencias.types';

@UseGuards(JwtCookieAuthGuard)
@Controller('pendencias')
export class PendenciasController {
  constructor(private readonly pendenciasService: PendenciasService) {}

  @Get()
  list(@Query() query: ListPendenciasQueryDto): Promise<PendenciaItem[]> {
    return this.pendenciasService.list(query);
  }
}
