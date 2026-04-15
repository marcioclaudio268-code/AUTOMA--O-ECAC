import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';

import { JwtCookieAuthGuard } from '../auth/guards/jwt-cookie-auth.guard';
import { ListCompanyLogsQueryDto } from './dto/list-company-logs-query.dto';
import { LogsService } from './logs.service';

@UseGuards(JwtCookieAuthGuard)
@Controller('companies/:companyId')
export class LogsController {
  constructor(private readonly logsService: LogsService) {}

  @Get('logs')
  listCompanyLogs(
    @Param('companyId') companyId: string,
    @Query() query: ListCompanyLogsQueryDto
  ) {
    return this.logsService.listCompanyLogs(companyId, query);
  }

  @Get('operational-history')
  getCompanyOperationalHistory(
    @Param('companyId') companyId: string,
    @Query() query: ListCompanyLogsQueryDto
  ) {
    return this.logsService.getCompanyOperationalHistory(companyId, query);
  }
}
