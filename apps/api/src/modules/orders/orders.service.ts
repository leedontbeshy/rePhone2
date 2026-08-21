import { Inject, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { ApiError } from '../../common/errors/api-error.js';
import { PrismaService } from '../../database/prisma.service.js';
import { CheckoutCartReader } from '../cart/checkout-cart.reader.js';
import { CheckoutCatalogReader } from '../catalog/checkout-catalog.reader.js';
import { CheckoutInventoryGateway } from '../inventory/checkout-inventory.gateway.js';
import { CheckoutSettingsReader } from '../settings/checkout-settings.reader.js';
import { CheckoutVoucherGateway } from '../vouchers/checkout-voucher.gateway.js';
import { calculateCheckoutPricing } from './checkout-pricing.js';
import type { CheckoutPreviewRequestDto } from './order.dto.js';
import type { CheckoutPreviewDto } from './order-response.dto.js';

@Injectable()
export class OrdersService {
  public constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(CheckoutCartReader) private readonly carts: CheckoutCartReader,
    @Inject(CheckoutCatalogReader) private readonly catalog: CheckoutCatalogReader,
    @Inject(CheckoutInventoryGateway) private readonly inventory: CheckoutInventoryGateway,
    @Inject(CheckoutVoucherGateway) private readonly vouchers: CheckoutVoucherGateway,
    @Inject(CheckoutSettingsReader) private readonly settings: CheckoutSettingsReader,
  ) {}

  public preview(request: Request, input: CheckoutPreviewRequestDto): Promise<CheckoutPreviewDto> {
    const identity = this.carts.resolveIdentity(request.auth, request);
    return this.prisma.$transaction(
      async (transaction) => {
        const now = new Date();
        const cart = await this.carts.findActive(identity, transaction);
        if (cart === null || this.carts.isExpired(cart, now) || cart.items.length === 0) {
          throw new ApiError('CART_EMPTY');
        }
        const catalogLines = await this.catalog.readLines(
          cart.items.map((item) => ({
            cartItemId: item.id,
            variantId: item.variantId,
            inventoryUnitId: item.inventoryUnitId,
            quantity: item.quantity,
          })),
          transaction,
        );
        const [settings, allocation] = await Promise.all([
          this.settings.read(transaction),
          this.inventory.selectLocation(catalogLines, input.fulfillmentType, transaction),
        ]);
        const voucher = await this.vouchers.preview(
          input.voucherCode,
          catalogLines.map((line) => ({
            cartItemId: line.cartItemId,
            productId: line.productId,
            productType: line.productType,
            variantId: line.variantId,
            lineSubtotal: (BigInt(line.unitPrice) * BigInt(line.quantity)).toString(),
          })),
          identity.kind === 'CUSTOMER' ? identity.customerId : null,
          now,
          transaction,
        );
        const pricing = calculateCheckoutPricing(
          catalogLines,
          settings,
          input.fulfillmentType,
          voucher,
        );
        return {
          cartUpdatedAt: cart.updatedAt.toISOString(),
          fulfillmentType: input.fulfillmentType,
          items: pricing.lines.map((line) => ({
            cartItemId: line.cartItemId,
            itemType: line.itemType,
            target: {
              productId: line.productId,
              productName: line.productName,
              variantId: line.variantId,
              variantName: line.variantName,
              inventoryCode: line.inventoryCode,
            },
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            lineSubtotal: line.lineSubtotal,
            discountAmount: line.discountAmount,
            lineTotal: line.lineTotal,
          })),
          pricing: {
            subtotal: pricing.subtotal,
            itemDiscountAmount: pricing.itemDiscountAmount,
            voucherDiscountAmount: pricing.voucherDiscountAmount,
            shippingFee: pricing.shippingFee,
            grandTotal: pricing.grandTotal,
            depositRequired: pricing.depositRequired,
            balanceDue: pricing.balanceDue,
          },
          ...(voucher === null
            ? {}
            : {
                voucher: {
                  code: voucher.code,
                  name: voucher.name,
                  discountAmount: voucher.discountAmount,
                },
              }),
          fulfillmentSummary: {
            type: input.fulfillmentType,
            ...(input.fulfillmentType === 'PICKUP'
              ? { pickupStore: { code: allocation.location.code, name: allocation.location.name } }
              : {}),
          },
          warnings: [],
          calculatedAt: now.toISOString(),
        };
      },
      { isolationLevel: 'RepeatableRead', maxWait: 2_000, timeout: 5_000 },
    );
  }
}
