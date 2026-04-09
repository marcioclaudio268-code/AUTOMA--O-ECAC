import { Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';

import { JwtCookieAuthGuard } from '../auth/guards/jwt-cookie-auth.guard';
import { ListRecentScansQueryDto } from './dto/list-recent-scans-query.dto';
import { ScansService } from './scans.service';

@UseGuards(JwtCookieAuthGuard)
@Controller()
export class ScansController {
  constructor(private readonly scansService: ScansService) {}

  @Post('companies/:companyId/scans/manual')
  executeManual(@Param('companyId') companyId: string) {
    return this.scansService.executeManual(companyId);
  }

  @Get('companies/:companyId/scans/recent')
  listRecent(
    @Param('companyId') companyId: string,
    @Query() query: ListRecentScansQueryDto
  ) {
    return this.scansService.listRecent(companyId, query.take);
  }
}
