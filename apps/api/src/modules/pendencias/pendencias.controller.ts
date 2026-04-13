import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  Req,
  UseGuards
} from '@nestjs/common';

import { JwtCookieAuthGuard } from '../auth/guards/jwt-cookie-auth.guard';
import type { AuthenticatedRequest } from '../auth/auth.types';
import { UpdatePendenciaDto } from './dto/update-pendencia.dto';
import { ListPendenciasQueryDto } from './dto/list-pendencias-query.dto';
import { PendenciasService } from './pendencias.service';
import { PendenciaRecord } from './pendencias.types';

@UseGuards(JwtCookieAuthGuard)
@Controller('pendencias')
export class PendenciasController {
  constructor(private readonly pendenciasService: PendenciasService) {}

  @Get()
  list(@Query() query: ListPendenciasQueryDto): Promise<PendenciaRecord[]> {
    return this.pendenciasService.list(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string): Promise<PendenciaRecord> {
    return this.pendenciasService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Req() request: AuthenticatedRequest,
    @Body() updatePendenciaDto: UpdatePendenciaDto
  ): Promise<PendenciaRecord> {
    return this.pendenciasService.update(
      id,
      updatePendenciaDto,
      request.user?.id
    );
  }
}
