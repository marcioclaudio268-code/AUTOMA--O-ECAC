import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { EventsModule } from '../events/events.module';
import { ScansController } from './scans.controller';
import { ScansService } from './scans.service';

@Module({
  imports: [AuthModule, PrismaModule, EventsModule],
  controllers: [ScansController],
  providers: [ScansService],
  exports: [ScansService]
})
export class ScansModule {}
