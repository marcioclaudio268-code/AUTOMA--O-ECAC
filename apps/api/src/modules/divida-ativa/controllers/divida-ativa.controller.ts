import {
  Controller,
  HttpCode,
  Param,
  Post,
  Req,
  UseGuards
} from '@nestjs/common';

import type { AuthenticatedRequest } from '../../auth/auth.types';
import { JwtCookieAuthGuard } from '../../auth/guards/jwt-cookie-auth.guard';

import { DividaAtivaService } from '../services/divida-ativa.service';

@UseGuards(JwtCookieAuthGuard)
@Controller('integracoes/divida-ativa')
export class DividaAtivaController {
  constructor(private readonly dividaAtivaService: DividaAtivaService) {}

  @Post('empresas/:empresaId/execute')
  @HttpCode(200)
  executeCompany(
    @Param('empresaId') empresaId: string,
    @Req() request: AuthenticatedRequest
  ) {
    return this.dividaAtivaService.executeCompany(empresaId, request.user?.id);
  }
}
