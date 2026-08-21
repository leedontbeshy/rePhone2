import { Inject, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { ApiError } from '../../common/errors/api-error.js';
import { PaginatedApiResult } from '../../common/http/api-response.interceptor.js';
import { requestContext } from '../../common/http/request-context.js';
import { SerializableTransactionRunner } from '../../database/serializable-transaction.runner.js';
import { PrismaService } from '../../database/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { AuditWriter } from '../audit/audit-writer.service.js';
import type { AuditWriteActorContext } from '../audit/audit.types.js';
import { CheckoutCartReader } from '../cart/checkout-cart.reader.js';
import { CheckoutCatalogReader } from '../catalog/checkout-catalog.reader.js';
import { CheckoutInventoryGateway } from '../inventory/checkout-inventory.gateway.js';
import { CheckoutPaymentGateway } from '../payments/checkout-payment.gateway.js';
import { CheckoutSettingsReader } from '../settings/checkout-settings.reader.js';
import { CheckoutVoucherGateway } from '../vouchers/checkout-voucher.gateway.js';
import {
  calculateCheckoutPricing,
  generateOrderNumber,
  orderTransferContent,
  type CheckoutPricing,
} from './checkout-pricing.js';
import { GuestOrderIdentityService } from './guest-order-identity.service.js';
import type {
  CheckoutPreviewRequestDto,
  CreateCheckoutRequestDto,
  OrderListQueryDto,
} from './order.dto.js';
import type {
  CheckoutPreviewDto,
  CheckoutResultDto,
  OrderDetailDto,
  OrderListItemDto,
} from './order-response.dto.js';
import { customerOrderInclude, projectOrder, requireOrder } from './order-projector.js';
import type { CheckoutCatalogLine } from '../catalog/checkout-catalog.reader.js';
import type { CheckoutSettings } from '../settings/checkout-settings.reader.js';
import type { CheckoutVoucherResult } from '../vouchers/checkout-voucher.gateway.js';
import type { CheckoutInventoryAllocation } from '../inventory/checkout-inventory.gateway.js';
import type { CheckoutIdentity, CheckoutCartRecord } from '../cart/checkout-cart.reader.js';

interface CheckoutCalculation {
  now: Date;
  cart: CheckoutCartRecord;
  catalogLines: CheckoutCatalogLine[];
  settings: CheckoutSettings;
  allocation: CheckoutInventoryAllocation;
  voucher: CheckoutVoucherResult | null;
  pricing: CheckoutPricing;
  preview: CheckoutPreviewDto;
}

export interface CreateCheckoutResult {
  result: CheckoutResultDto;
  created: boolean;
}

@Injectable()
export class OrdersService {
  public constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(CheckoutCartReader) private readonly carts: CheckoutCartReader,
    @Inject(CheckoutCatalogReader) private readonly catalog: CheckoutCatalogReader,
    @Inject(CheckoutInventoryGateway) private readonly inventory: CheckoutInventoryGateway,
    @Inject(CheckoutVoucherGateway) private readonly vouchers: CheckoutVoucherGateway,
    @Inject(CheckoutSettingsReader) private readonly settings: CheckoutSettingsReader,
    @Inject(CheckoutPaymentGateway) private readonly payments: CheckoutPaymentGateway,
    @Inject(SerializableTransactionRunner)
    private readonly transactions: SerializableTransactionRunner,
    @Inject(GuestOrderIdentityService)
    private readonly guestOrders: GuestOrderIdentityService,
    @Inject(AuditWriter) private readonly audit: AuditWriter,
  ) {}

  public preview(request: Request, input: CheckoutPreviewRequestDto): Promise<CheckoutPreviewDto> {
    const identity = this.carts.resolveIdentity(request.auth, request);
    return this.prisma.$transaction(
      async (transaction) => (await this.calculate(identity, input, transaction)).preview,
      { isolationLevel: 'RepeatableRead', maxWait: 2_000, timeout: 5_000 },
    );
  }

  public async create(
    request: Request,
    input: CreateCheckoutRequestDto,
  ): Promise<CreateCheckoutResult> {
    this.validateFulfillmentInput(input);
    const identity = this.carts.resolveIdentity(request.auth, request);
    const rawGuestToken = identity.kind === 'GUEST' ? this.guestOrders.createToken() : undefined;
    const actor = this.auditActor(identity, request);
    const outcome = await this.transactions.run(
      'orders.create',
      async (transaction) => {
        await this.carts.lockIdentity(identity, transaction);
        let cart = await this.carts.findActive(identity, transaction);
        if (cart === null) {
          const converted = await this.carts.findLatestConverted(identity, transaction);
          if (converted?.order === null || converted?.order === undefined) {
            throw new ApiError('CART_NOT_ACTIVE');
          }
          return { orderId: converted.order.id, created: false };
        }
        await this.carts.lockCart(cart.id, transaction);
        cart = await this.carts.findActive(identity, transaction);
        if (cart === null) throw new ApiError('CART_NOT_ACTIVE');
        const calculation = await this.calculate(identity, input, transaction, cart);
        if (
          input.expectedCartUpdatedAt !== calculation.preview.cartUpdatedAt ||
          input.expectedGrandTotal !== calculation.pricing.grandTotal ||
          input.expectedDepositRequired !== calculation.pricing.depositRequired
        ) {
          throw checkoutChanged(calculation.preview);
        }

        const positiveShippingDeposit =
          input.fulfillmentType === 'SHIPPING' && calculation.pricing.depositRequired !== '0';
        const zeroShippingOrder =
          input.fulfillmentType === 'SHIPPING' && calculation.pricing.grandTotal === '0';
        const reservationDeadline = positiveShippingDeposit
          ? addMinutes(calculation.now, calculation.settings.depositProofWindowMinutes)
          : input.fulfillmentType === 'PICKUP'
            ? addMinutes(calculation.now, calculation.settings.pickupHoldMinutes)
            : null;
        const orderNumber = generateOrderNumber(calculation.now, calculation.settings.timezone);
        const order = await transaction.order.create({
          data: {
            orderNumber,
            sourceCartId: calculation.cart.id,
            customerId: identity.kind === 'CUSTOMER' ? identity.customerId : null,
            guestAccessTokenHash:
              rawGuestToken === undefined ? null : this.guestOrders.digestToken(rawGuestToken),
            customerName: input.contact.fullName,
            customerEmail: input.contact.email,
            customerPhone: input.contact.phone,
            fulfillmentType: input.fulfillmentType,
            fulfillmentStatus: zeroShippingOrder ? 'PREPARING' : 'PENDING',
            fulfillmentLocationId: calculation.allocation.location.id,
            ...(input.shippingAddress === undefined
              ? {}
              : {
                  shippingAddressSnapshot:
                    input.shippingAddress as unknown as Prisma.InputJsonObject,
                }),
            pickupLocationId:
              input.fulfillmentType === 'PICKUP' ? calculation.allocation.location.id : null,
            pickupHoldUntil: input.fulfillmentType === 'PICKUP' ? reservationDeadline : null,
            status: zeroShippingOrder ? 'CONFIRMED' : 'PLACED',
            paymentStatus: calculation.pricing.grandTotal === '0' ? 'PAID' : 'UNPAID',
            subtotal: calculation.pricing.subtotal,
            itemDiscountAmount: calculation.pricing.itemDiscountAmount,
            voucherDiscountAmount: calculation.pricing.voucherDiscountAmount,
            shippingFeeOriginal: calculation.pricing.shippingFeeOriginal,
            shippingFee: calculation.pricing.shippingFee,
            grandTotal: calculation.pricing.grandTotal,
            depositRequired: calculation.pricing.depositRequired,
            paidAmount: '0',
            refundedAmount: '0',
            balanceDue: calculation.pricing.balanceDue,
            voucherCodeSnapshot: calculation.voucher?.code ?? null,
            customerNote: input.customerNote ?? null,
            confirmedAt: zeroShippingOrder ? calculation.now : null,
          },
        });
        const orderItemIds = new Map<string, string>();
        for (const line of calculation.pricing.lines) {
          const item = await transaction.orderItem.create({
            data: {
              orderId: order.id,
              productId: line.productId,
              variantId: line.variantId,
              inventoryUnitId: line.inventoryUnitId,
              productTypeSnapshot: line.productType,
              productNameSnapshot: line.productName,
              variantNameSnapshot: line.variantName,
              skuSnapshot: line.sku,
              inventoryCodeSnapshot: line.inventoryCode,
              configurationSnapshot: line.configurationSnapshot,
              quantity: line.quantity,
              unitPrice: line.unitPrice,
              lineSubtotal: line.lineSubtotal,
              discountAmount: line.discountAmount,
              lineTotal: line.lineTotal,
              warrantyDaysSnapshot: line.warrantyDays,
              warrantyTermsSnapshot: line.warrantyTerms,
            },
          });
          orderItemIds.set(line.cartItemId, item.id);
        }
        try {
          await this.inventory.reserve(
            {
              orderId: order.id,
              orderItemIds,
              allocation: calculation.allocation,
              holdReason:
                input.fulfillmentType === 'PICKUP'
                  ? 'PICKUP'
                  : positiveShippingDeposit
                    ? 'DEPOSIT'
                    : 'FULFILLMENT',
              expiresAt: reservationDeadline,
            },
            transaction,
          );
        } catch (error) {
          if (isUniqueError(error)) throw new ApiError('INVENTORY_NOT_AVAILABLE');
          throw error;
        }
        if (calculation.voucher !== null) {
          await this.vouchers.reserve(
            calculation.voucher.id,
            order.id,
            identity.kind === 'CUSTOMER' ? identity.customerId : null,
            transaction,
          );
        }
        if (positiveShippingDeposit && reservationDeadline !== null) {
          await this.payments.createDeposit(
            {
              orderId: order.id,
              expectedAmount: calculation.pricing.depositRequired,
              transferContent: orderTransferContent(orderNumber),
              bankName: calculation.settings.bankName,
              bankAccountNumber: calculation.settings.bankAccountNumber,
              bankAccountHolder: calculation.settings.bankAccountHolder,
              bankQrBucket: calculation.settings.bankQrBucket,
              bankQrObjectPath: calculation.settings.bankQrObjectPath,
              reviewWindowMinutes: calculation.settings.depositReviewWindowMinutes,
              expiresAt: reservationDeadline,
            },
            transaction,
          );
        }
        const converted = await transaction.cart.updateMany({
          where: { id: calculation.cart.id, status: 'ACTIVE' },
          data: { status: 'CONVERTED' },
        });
        if (converted.count !== 1) throw new ApiError('CART_NOT_ACTIVE');
        await this.audit.write(transaction, actor, {
          action: 'order.created',
          resourceType: 'Order',
          resourceId: order.id,
          metadata: {
            orderNumber,
            fulfillmentType: input.fulfillmentType,
            subtotal: calculation.pricing.subtotal,
            voucherDiscountAmount: calculation.pricing.voucherDiscountAmount,
            shippingFee: calculation.pricing.shippingFee,
            grandTotal: calculation.pricing.grandTotal,
            depositRequired: calculation.pricing.depositRequired,
            status: zeroShippingOrder ? 'CONFIRMED' : 'PLACED',
          },
        });
        return { orderId: order.id, created: true };
      },
      isOrderNumberCollision,
    );
    const order = requireOrder(
      await this.prisma.order.findUnique({
        where: { id: outcome.orderId },
        include: customerOrderInclude,
      }),
    );
    return {
      result: {
        order: projectOrder(order),
        ...(outcome.created && rawGuestToken !== undefined
          ? { guestAccessToken: rawGuestToken }
          : {}),
      },
      created: outcome.created,
    };
  }

  public async list(
    auth: NonNullable<Request['auth']>,
    query: OrderListQueryDto,
  ): Promise<PaginatedApiResult<OrderListItemDto>> {
    if (auth.role !== 'CUSTOMER') throw new ApiError('FORBIDDEN');
    const where: Prisma.OrderWhereInput = {
      customerId: auth.userId,
      ...(query.status === undefined ? {} : { status: query.status }),
      ...(query.fulfillmentType === undefined ? {} : { fulfillmentType: query.fulfillmentType }),
    };
    const orderBy = [
      { [query.sortBy]: query.sortOrder },
      { id: query.sortOrder },
    ] as Prisma.OrderOrderByWithRelationInput[];
    const [orders, totalItems] = await Promise.all([
      this.prisma.order.findMany({
        where,
        select: {
          orderNumber: true,
          status: true,
          fulfillmentStatus: true,
          paymentStatus: true,
          fulfillmentType: true,
          grandTotal: true,
          depositRequired: true,
          balanceDue: true,
          placedAt: true,
          items: {
            select: { productNameSnapshot: true, quantity: true },
            orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          },
        },
        orderBy,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.order.count({ where }),
    ]);
    return new PaginatedApiResult(
      orders.map((order) => ({
        orderNumber: order.orderNumber,
        status: order.status,
        fulfillmentStatus: order.fulfillmentStatus,
        paymentStatus: order.paymentStatus,
        fulfillmentType: order.fulfillmentType,
        firstItemName: order.items[0]?.productNameSnapshot ?? '',
        totalItemQuantity: order.items.reduce((sum, item) => sum + item.quantity, 0),
        grandTotal: order.grandTotal.toString(),
        depositRequired: order.depositRequired.toString(),
        balanceDue: order.balanceDue.toString(),
        placedAt: order.placedAt.toISOString(),
      })),
      {
        page: query.page,
        pageSize: query.pageSize,
        totalItems,
        totalPages: totalItems === 0 ? 0 : Math.ceil(totalItems / query.pageSize),
      },
    );
  }

  public async detail(request: Request, orderNumber: string): Promise<OrderDetailDto> {
    const order = requireOrder(
      await this.prisma.order.findUnique({
        where: { orderNumber },
        include: customerOrderInclude,
      }),
    );
    this.assertOrderAccess(request, order);
    return projectOrder(order);
  }

  private async calculate(
    identity: CheckoutIdentity,
    input: CheckoutPreviewRequestDto,
    transaction: Prisma.TransactionClient,
    existingCart?: CheckoutCartRecord,
  ): Promise<CheckoutCalculation> {
    const now = new Date();
    const cart = existingCart ?? (await this.carts.findActive(identity, transaction));
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
    const preview = this.toPreview(cart, input, allocation, pricing, voucher, now);
    return { now, cart, catalogLines, settings, allocation, voucher, pricing, preview };
  }

  private toPreview(
    cart: CheckoutCartRecord,
    input: CheckoutPreviewRequestDto,
    allocation: CheckoutInventoryAllocation,
    pricing: CheckoutPricing,
    voucher: CheckoutVoucherResult | null,
    now: Date,
  ): CheckoutPreviewDto {
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
  }

  private validateFulfillmentInput(input: CreateCheckoutRequestDto): void {
    if (
      (input.fulfillmentType === 'SHIPPING' && input.shippingAddress === undefined) ||
      (input.fulfillmentType === 'PICKUP' && input.shippingAddress !== undefined)
    ) {
      throw new ApiError('VALIDATION_FAILED', undefined, [
        {
          field: 'shippingAddress',
          code: 'FULFILLMENT_ADDRESS_MISMATCH',
          message:
            input.fulfillmentType === 'SHIPPING'
              ? 'Địa chỉ giao hàng là bắt buộc.'
              : 'Đơn nhận tại cửa hàng không được gửi địa chỉ giao hàng.',
        },
      ]);
    }
  }

  private auditActor(identity: CheckoutIdentity, request: Request): AuditWriteActorContext {
    const context = requestContext(request);
    return identity.kind === 'CUSTOMER'
      ? { ...context, actorType: 'USER', actorUserId: identity.customerId }
      : { ...context, actorType: 'GUEST' };
  }

  private assertOrderAccess(request: Request, order: ReturnType<typeof requireOrder>): void {
    if (request.auth !== undefined) {
      if (request.auth.role !== 'CUSTOMER') throw new ApiError('FORBIDDEN');
      if (order.customerId !== request.auth.userId) throw new ApiError('ORDER_NOT_FOUND');
      return;
    }
    const rawOrderToken = this.guestOrders.readToken(request);
    if (this.guestOrders.matches(rawOrderToken, order.guestAccessTokenHash)) return;
    const identity = this.carts.resolveIdentity(undefined, request);
    const activeConvertedCookie =
      identity.kind === 'GUEST' &&
      identity.guestTokenHash !== undefined &&
      order.sourceCart.status === 'CONVERTED' &&
      order.sourceCart.guestTokenHash === identity.guestTokenHash &&
      (order.sourceCart.expiresAt === null || order.sourceCart.expiresAt > new Date());
    if (!activeConvertedCookie) throw new ApiError('ORDER_NOT_FOUND');
  }
}

function addMinutes(value: Date, minutes: number): Date {
  return new Date(value.getTime() + minutes * 60_000);
}

function checkoutChanged(current: CheckoutPreviewDto): ApiError {
  return new ApiError('CHECKOUT_REVIEW_REQUIRED', undefined, [
    {
      code: 'CHECKOUT_CHANGED',
      message: 'Giỏ hàng hoặc tổng tiền đã thay đổi.',
      current,
    },
  ]);
}

function isUniqueError(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'P2002'
  );
}

function isOrderNumberCollision(error: unknown): boolean {
  if (!isUniqueError(error)) return false;
  const target = (error as { meta?: { target?: unknown } }).meta?.target;
  return Array.isArray(target)
    ? target.some((value) => value === 'order_number' || value === 'orderNumber')
    : typeof target === 'string' && /order(_number|Number)/.test(target);
}
