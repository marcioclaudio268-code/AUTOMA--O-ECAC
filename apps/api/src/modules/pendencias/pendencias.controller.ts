import { Controller, Get, Query, UseGuards } from '@nestjs/common';

import { JwtCookieAuthGuard } from '../auth/guards/jwt-cookie-auth.guard';
import { ListPendenciasQueryDto } from './dto/list-pendencias-query.dto';
import { PendenciasService } from './pendencias.service';

@UseGuards(JwtCookieAuthGuard)
@Controller('pendencias')
export class PendenciasController {
  constructor(private readonly pendenciasService: PendenciasService) {}

  @Get()
  findAll(@Query() query: ListPendenciasQueryDto) {
    return this.pendenciasService.findAll(query);
  }
}
