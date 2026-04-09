import { Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';

import { JwtCookieAuthGuard } from '../auth/guards/jwt-cookie-auth.guard';
import { ListCompanyPendenciasQueryDto } from './dto/list-company-pendencias-query.dto';
import { PendenciasService } from './pendencias.service';

@UseGuards(JwtCookieAuthGuard)
@Controller('companies/:companyId/pendencias')
export class CompanyPendenciasController {
  constructor(private readonly pendenciasService: PendenciasService) {}

  @Get()
  list(
    @Param('companyId') companyId: string,
    @Query() query: ListCompanyPendenciasQueryDto
  ) {
    return this.pendenciasService.listCompanyPendencias(companyId, query.take);
  }

  @Patch(':pendenciaId/resolver')
  resolve(
    @Param('companyId') companyId: string,
    @Param('pendenciaId') pendenciaId: string
  ) {
    return this.pendenciasService.resolveCompanyPendencia(companyId, pendenciaId);
  }
}
