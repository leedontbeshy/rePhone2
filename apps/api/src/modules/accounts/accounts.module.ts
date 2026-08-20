import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { AccountsController } from './accounts.controller.js';
import { AccountsRepository } from './accounts.repository.js';
import { AccountsService } from './accounts.service.js';

@Module({
  imports: [AuthModule],
  controllers: [AccountsController],
  providers: [AccountsService, AccountsRepository],
})
export class AccountsModule {}
