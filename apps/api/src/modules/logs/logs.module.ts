import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { LogsController } from './logs.controller';
import { LogsService } from './logs.service';

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [LogsController],
  providers: [LogsService],
  exports: [LogsService]
})
export class LogsModule {}
