import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { CatalogModule } from '../catalog/catalog.module.js';
import { CartController } from './cart.controller.js';
import { CartRepository } from './cart.repository.js';
import { CartService } from './cart.service.js';
import { CheckoutCartReader } from './checkout-cart.reader.js';

@Module({
  imports: [AuthModule, CatalogModule],
  controllers: [CartController],
  providers: [CartRepository, CartService, CheckoutCartReader],
  exports: [CartService, CheckoutCartReader],
})
export class CartModule {}
