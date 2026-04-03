import {
  Body,
  Controller,
  Get,
  Param,
  ParseEnumPipe,
  Post,
  Patch,
  UseGuards
} from '@nestjs/common';
import { TipoIntegracao } from '@prisma/client';

import { JwtCookieAuthGuard } from '../../auth/guards/jwt-cookie-auth.guard';
import { ExecuteCompanyIntegrationDto } from '../dto/execute-company-integration.dto';
import { SaveCompanyIntegrationDto } from '../dto/save-company-integration.dto';
import { CompanyIntegrationExecutionService } from '../services/company-integration-execution.service';
import { CompanyIntegrationsService } from '../services/company-integrations.service';

@UseGuards(JwtCookieAuthGuard)
@Controller('companies/:companyId/integrations')
export class CompanyIntegrationsController {
  constructor(
    private readonly companyIntegrationExecutionService: CompanyIntegrationExecutionService,
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

  @Post(':tipoIntegracao/execute')
  execute(
    @Param('companyId') companyId: string,
    @Param('tipoIntegracao', new ParseEnumPipe(TipoIntegracao))
    tipoIntegracao: TipoIntegracao,
    @Body() executeCompanyIntegrationDto: ExecuteCompanyIntegrationDto
  ) {
    return this.companyIntegrationExecutionService.execute(
      companyId,
      tipoIntegracao,
      executeCompanyIntegrationDto
    );
  }
}
