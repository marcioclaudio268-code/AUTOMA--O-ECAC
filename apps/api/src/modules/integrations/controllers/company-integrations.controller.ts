import {
  Body,
  Controller,
  Get,
  Param,
  ParseEnumPipe,
  Patch,
  UseGuards
} from '@nestjs/common';
import { TipoIntegracao } from '@prisma/client';

import { JwtCookieAuthGuard } from '../../auth/guards/jwt-cookie-auth.guard';
import { SaveCompanyIntegrationDto } from '../dto/save-company-integration.dto';
import { CompanyIntegrationsService } from '../services/company-integrations.service';

@UseGuards(JwtCookieAuthGuard)
@Controller('companies/:companyId/integrations')
export class CompanyIntegrationsController {
  constructor(
    private readonly companyIntegrationsService: CompanyIntegrationsService
  ) {}

  @Get()
  findAll(@Param('companyId') companyId: string) {
    return this.companyIntegrationsService.findAll(companyId);
  }

  @Get(':tipoIntegracao')
  findOne(
    @Param('companyId') companyId: string,
    @Param('tipoIntegracao', new ParseEnumPipe(TipoIntegracao))
    tipoIntegracao: TipoIntegracao
  ) {
    return this.companyIntegrationsService.findOne(companyId, tipoIntegracao);
  }

  @Patch(':tipoIntegracao')
  save(
    @Param('companyId') companyId: string,
    @Param('tipoIntegracao', new ParseEnumPipe(TipoIntegracao))
    tipoIntegracao: TipoIntegracao,
    @Body() saveCompanyIntegrationDto: SaveCompanyIntegrationDto
  ) {
    return this.companyIntegrationsService.save(
      companyId,
      tipoIntegracao,
      saveCompanyIntegrationDto
    );
  }
}
