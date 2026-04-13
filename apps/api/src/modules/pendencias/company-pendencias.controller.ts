import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards
} from '@nestjs/common';

import { JwtCookieAuthGuard } from '../auth/guards/jwt-cookie-auth.guard';
import type { AuthenticatedRequest } from '../auth/auth.types';
import { CreatePendenciaDto } from './dto/create-pendencia.dto';
import { ListCompanyPendenciasQueryDto } from './dto/list-company-pendencias-query.dto';
import { PendenciasService } from './pendencias.service';
import { PendenciaRecord } from './pendencias.types';

@UseGuards(JwtCookieAuthGuard)
@Controller('companies/:companyId/pendencias')
export class CompanyPendenciasController {
  constructor(private readonly pendenciasService: PendenciasService) {}

  @Get()
  list(
    @Param('companyId') companyId: string,
    @Query() query: ListCompanyPendenciasQueryDto
  ): Promise<PendenciaRecord[]> {
    return this.pendenciasService.listCompanyPendencias(companyId, query);
  }

  @Post()
  create(
    @Param('companyId') companyId: string,
    @Req() request: AuthenticatedRequest,
    @Body() createPendenciaDto: CreatePendenciaDto
  ): Promise<PendenciaRecord> {
    return this.pendenciasService.createCompanyPendencia(
      companyId,
      createPendenciaDto,
      request.user?.id
    );
  }

  @Patch(':pendenciaId/resolver')
  resolve(
    @Param('companyId') companyId: string,
    @Param('pendenciaId') pendenciaId: string,
    @Req() request: AuthenticatedRequest
  ): Promise<PendenciaRecord> {
    return this.pendenciasService.resolveCompanyPendencia(
      companyId,
      pendenciaId,
      request.user?.id
    );
  }
}
