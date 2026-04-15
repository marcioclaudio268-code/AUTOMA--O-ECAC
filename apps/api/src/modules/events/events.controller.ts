import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';

import { JwtCookieAuthGuard } from '../auth/guards/jwt-cookie-auth.guard';
import { ListRecentEventsQueryDto } from './dto/list-recent-events-query.dto';
import { EventsService } from './events.service';

@UseGuards(JwtCookieAuthGuard)
@Controller()
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Get('companies/:companyId/events/recent')
  listRecent(
    @Param('companyId') companyId: string,
    @Query() query: ListRecentEventsQueryDto
  ) {
    return this.eventsService.listRecent(companyId, query.take);
  }
}
