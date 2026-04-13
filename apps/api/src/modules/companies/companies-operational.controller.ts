import { Body, Controller, Param, Post, Req, UseGuards } from '@nestjs/common';

import { JwtCookieAuthGuard } from '../auth/guards/jwt-cookie-auth.guard';
import type { AuthenticatedRequest } from '../auth/auth.types';
import { CompanyOperationalActionDto } from './dto/company-operational-action.dto';
import { PendenciasService } from '../pendencias/pendencias.service';

@UseGuards(JwtCookieAuthGuard)
@Controller('companies/:companyId/operational')
export class CompaniesOperationalController {
  constructor(private readonly pendenciasService: PendenciasService) {}

  @Post('check')
  registerOperationalCheck(
    @Param('companyId') companyId: string,
    @Req() request: AuthenticatedRequest,
    @Body() body?: CompanyOperationalActionDto
  ) {
    return this.pendenciasService.ensureCompanyOperationalCheck(
      companyId,
      request.user?.id,
      body?.chaveIdempotencia
    );
  }

  @Post('regularize')
  regularizeOperationalPendencia(
    @Param('companyId') companyId: string,
    @Req() request: AuthenticatedRequest,
    @Body() body?: CompanyOperationalActionDto
  ) {
    if (body?.pendenciaId) {
      return this.pendenciasService.resolveCompanyPendencia(
        companyId,
        body.pendenciaId,
        request.user?.id,
        body?.chaveIdempotencia
      );
    }

    return this.pendenciasService.resolveFirstOpenOperationalPendencia(
      companyId,
      request.user?.id,
      body?.chaveIdempotencia
    );
  }

  @Post('remove-from-wallet')
  removeFromWallet(
    @Param('companyId') companyId: string,
    @Req() request: AuthenticatedRequest,
    @Body() body?: CompanyOperationalActionDto
  ) {
    return this.pendenciasService.removeCompanyFromWallet(
      companyId,
      request.user?.id,
      body?.chaveIdempotencia
    );
  }
}
