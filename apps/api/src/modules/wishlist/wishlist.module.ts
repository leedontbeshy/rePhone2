import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { CatalogModule } from '../catalog/catalog.module.js';
import { WishlistController } from './wishlist.controller.js';
import { WishlistRepository } from './wishlist.repository.js';
import { WishlistService } from './wishlist.service.js';

@Module({
  imports: [AuthModule, CatalogModule],
  controllers: [WishlistController],
  providers: [WishlistRepository, WishlistService],
})
export class WishlistModule {}
