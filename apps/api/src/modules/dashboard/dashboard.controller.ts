import { Controller, Get, UseGuards } from '@nestjs/common';

import { JwtCookieAuthGuard } from '../auth/guards/jwt-cookie-auth.guard';
import {
  DashboardService,
  type DashboardSummaryResponse
} from './dashboard.service';

@UseGuards(JwtCookieAuthGuard)
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('summary')
  getSummary(): Promise<DashboardSummaryResponse> {
    return this.dashboardService.getSummary();
  }
}
