import { Body, Controller, Get, HttpCode, Patch, Post, Query, UseGuards } from '@nestjs/common';

import { JwtCookieAuthGuard } from '../../auth/guards/jwt-cookie-auth.guard';

import { UpsertAcessoriasConfigDto } from './dto/upsert-acessorias-config.dto';
import { ListAcessoriasJobsQueryDto } from './dto/list-acessorias-jobs-query.dto';
import { AcessoriasService } from './acessorias.service';

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
}
