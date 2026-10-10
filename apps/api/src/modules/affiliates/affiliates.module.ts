import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { AuditModule } from '../audit/audit.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { StorageModule } from '../storage/storage.module.js';
import { AffiliateCoreModule } from '../affiliate-core/affiliate-core.module.js';
import { AffiliateProfileService } from './affiliate-profile.service.js';
import { AffiliatePayoutService } from './affiliate-payout.service.js';
import { AffiliateQueryService } from './affiliate-query.service.js';
import {
  AffiliateAdminController,
  AffiliatePortalController,
  AffiliatePublicController,
} from './affiliate.controller.js';
@Module({
  imports: [AffiliateCoreModule, AuthModule, AuditModule, NotificationsModule, StorageModule],
  controllers: [AffiliateAdminController, AffiliatePortalController, AffiliatePublicController],
  providers: [AffiliateProfileService, AffiliatePayoutService, AffiliateQueryService],
})
export class AffiliatesModule {}
