import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards
} from '@nestjs/common';

import type { AuthenticatedRequest } from '../../auth/auth.types';
import { JwtCookieAuthGuard } from '../../auth/guards/jwt-cookie-auth.guard';

import { UpsertAcessoriasConfigDto } from './dto/upsert-acessorias-config.dto';
import { ListAcessoriasJobsQueryDto } from './dto/list-acessorias-jobs-query.dto';
import { AcessoriasService } from './acessorias.service';
import { LinkAcessoriasEmpresaDto } from './dto/link-acessorias-empresa.dto';

@UseGuards(JwtCookieAuthGuard)
@Controller('integracoes/acessorias')
export class AcessoriasController {
  constructor(private readonly acessoriasService: AcessoriasService) {}

  @Post('config')
  createConfig(@Body() dto: UpsertAcessoriasConfigDto) {
    return this.acessoriasService.saveConfig(dto);
  }

  @Get('config')
  getConfig() {
    return this.acessoriasService.getConfig();
  }

  @Patch('config')
  updateConfig(@Body() dto: UpsertAcessoriasConfigDto) {
    return this.acessoriasService.saveConfig(dto);
  }

  @Post('test-connection')
  @HttpCode(200)
  testConnection() {
    return this.acessoriasService.testConnection();
  }

  @Get('jobs')
  listJobs(@Query() query: ListAcessoriasJobsQueryDto) {
    return this.acessoriasService.listJobs(query);
  }

  @Post('empresas/sync')
  @HttpCode(200)
  syncCompanies() {
    return this.acessoriasService.syncCompanies();
  }

  @Get('empresas')
  listCompanies() {
    return this.acessoriasService.listCompanies();
  }

  @Get('empresas/vinculos')
  listVinculos() {
    return this.acessoriasService.listVinculos();
  }

  @Post('empresas/:empresaId/link')
  @HttpCode(200)
  linkCompany(
    @Param('empresaId') empresaId: string,
    @Body() dto: LinkAcessoriasEmpresaDto
  ) {
    return this.acessoriasService.linkCompany(empresaId, dto);
  }

  @Delete('empresas/:empresaId/link')
  @HttpCode(200)
  unlinkCompany(@Param('empresaId') empresaId: string) {
    return this.acessoriasService.unlinkCompany(empresaId);
  }

  @Post('empresas/:empresaId/execute')
  @HttpCode(200)
  executeCompany(
    @Param('empresaId') empresaId: string,
    @Req() request: AuthenticatedRequest
  ) {
    return this.acessoriasService.executeCompany(
      empresaId,
      request.user?.id
    );
  }
}
