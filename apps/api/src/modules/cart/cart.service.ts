import { Inject, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { ApiError } from '../../common/errors/api-error.js';
import { APP_CONFIG } from '../../config/app-config.module.js';
import type { AppConfig } from '../../config/app-config.js';
import { SerializableTransactionRunner } from '../../database/serializable-transaction.runner.js';
import type { Prisma } from '../../generated/prisma/client.js';
import type { AuthContext } from '../auth/auth-context.js';
import { GuestCartIdentityService } from '../auth/guest-cart-identity.service.js';
import {
  CommerceOfferReader,
  offerKey,
  type CommerceOffer,
} from '../catalog/commerce-offer.reader.js';
import type { AddCartItemDto } from './cart.dto.js';
import type { CartDto, CartItemDto, CartWarning } from './cart-response.dto.js';
import { CartRepository, type CartRecord } from './cart.repository.js';

interface CartIdentity {
  customerId?: string;
  guestToken?: string;
  guestTokenHash?: string;
}

export interface CartMutationResult {
  cart: CartDto;
  issuedGuestToken?: string;
  created?: boolean;
}

@Injectable()
export class CartService {
  public constructor(
    @Inject(CartRepository) private readonly carts: CartRepository,
    @Inject(CommerceOfferReader) private readonly offers: CommerceOfferReader,
    @Inject(SerializableTransactionRunner)
    private readonly transactions: SerializableTransactionRunner,
    @Inject(GuestCartIdentityService)
    private readonly guestIdentity: GuestCartIdentityService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  public async getCart(request: Request): Promise<CartDto> {
    const identity = this.resolveIdentity(request.auth, request);
    const cart = await this.findActive(identity);
    if (cart === null || this.isExpired(cart)) {
      return emptyCart();
    }
    return this.project(cart);
  }

  public async addItem(request: Request, input: AddCartItemDto): Promise<CartMutationResult> {
    const initialIdentity = this.resolveIdentity(request.auth, request);
    const issuedGuestToken =
      initialIdentity.customerId === undefined && initialIdentity.guestToken === undefined
        ? this.guestIdentity.createToken()
        : undefined;
    const identity =
      issuedGuestToken === undefined
        ? initialIdentity
        : {
            guestToken: issuedGuestToken,
            guestTokenHash: this.guestIdentity.digestToken(issuedGuestToken),
          };
    const result = await this.transactions.run('cart.add-item', async (transaction) => {
      await this.carts.lockIdentity(identityKey(identity), transaction);
      const cart = await this.findOrCreateActive(identity, transaction);
      await this.carts.lockCart(cart.id, transaction);
      const offer = await this.resolveOfferForAdd(input, transaction);
      const existing = cart.items.find((item) =>
        input.itemType === 'IPHONE'
          ? item.inventoryUnitId === offer.inventoryUnitId
          : item.inventoryUnitId === null && item.variantId === offer.variantId,
      );
      const quantity = input.itemType === 'IPHONE' ? 1 : (input.quantity as number);
      if (existing === undefined) {
        await transaction.cartItem.create({
          data: {
            cartId: cart.id,
            variantId: offer.variantId,
            inventoryUnitId: offer.inventoryUnitId ?? null,
            quantity,
            priceAtAddition: offer.currentUnitPrice as string,
          },
        });
        await touchCart(cart.id, transaction);
      } else if (existing.quantity !== quantity) {
        await transaction.cartItem.update({ where: { id: existing.id }, data: { quantity } });
        await touchCart(cart.id, transaction);
      }
      return { cartId: cart.id, created: existing === undefined };
    });
    const cart = await this.carts.findActiveById(result.cartId);
    if (cart === null) {
      throw new ApiError('CART_NOT_ACTIVE');
    }
    return {
      cart: await this.project(cart),
      ...(issuedGuestToken === undefined ? {} : { issuedGuestToken }),
      created: result.created,
    };
  }

  public async updateItem(request: Request, itemId: string, quantity: number): Promise<CartDto> {
    const identity = this.resolveIdentity(request.auth, request);
    requireExistingIdentity(identity);
    const cartId = await this.transactions.run('cart.update-item', async (transaction) => {
      await this.carts.lockIdentity(identityKey(identity), transaction);
      const cart = await this.findExistingActive(identity, transaction);
      await this.carts.lockCart(cart.id, transaction);
      const item = cart.items.find((candidate) => candidate.id === itemId);
      if (item === undefined) {
        throw new ApiError('RESOURCE_NOT_FOUND');
      }
      if (item.inventoryUnitId !== null) {
        throw new ApiError('CART_ITEM_QUANTITY_FIXED');
      }
      await transaction.cartItem.update({ where: { id: item.id }, data: { quantity } });
      await touchCart(cart.id, transaction);
      return cart.id;
    });
    const cart = await this.carts.findActiveById(cartId);
    if (cart === null) throw new ApiError('CART_NOT_ACTIVE');
    return this.project(cart);
  }

  public async removeItem(request: Request, itemId: string): Promise<void> {
    const identity = this.resolveIdentity(request.auth, request);
    requireExistingIdentity(identity);
    await this.transactions.run('cart.remove-item', async (transaction) => {
      await this.carts.lockIdentity(identityKey(identity), transaction);
      const cart = await this.findExistingActive(identity, transaction);
      await this.carts.lockCart(cart.id, transaction);
      const item = cart.items.find((candidate) => candidate.id === itemId);
      if (item === undefined) throw new ApiError('RESOURCE_NOT_FOUND');
      await transaction.cartItem.delete({ where: { id: item.id } });
      await touchCart(cart.id, transaction);
    });
  }

  public async merge(auth: AuthContext, request: Request): Promise<CartDto> {
    if (auth.role !== 'CUSTOMER') throw new ApiError('FORBIDDEN');
    const guestToken = this.guestIdentity.readToken(request);
    const guestTokenHash =
      guestToken === undefined ? undefined : this.guestIdentity.digestToken(guestToken);
    const cappedItemIds = new Set<string>();
    const cartId = await this.transactions.run('cart.merge', async (transaction) => {
      const keys = [`customer:${auth.userId}`];
      if (guestTokenHash !== undefined) keys.push(`guest:${guestTokenHash}`);
      for (const key of keys.sort()) await this.carts.lockIdentity(key, transaction);

      const customerCart = await this.carts.findActiveForCustomer(auth.userId, transaction);
      const guestCart =
        guestTokenHash === undefined
          ? null
          : await this.carts.findActiveForGuest(guestTokenHash, transaction);
      const activeGuest = guestCart !== null && !this.isExpired(guestCart) ? guestCart : null;
      if (guestCart !== null && activeGuest === null) {
        await transaction.cart.update({ where: { id: guestCart.id }, data: { status: 'EXPIRED' } });
      }
      if (activeGuest === null) return customerCart?.id ?? null;

      if (customerCart === null) {
        const claimed = await transaction.cart.update({
          where: { id: activeGuest.id },
          data: { customerId: auth.userId, guestTokenHash: null, expiresAt: null },
          select: { id: true },
        });
        return claimed.id;
      }

      await this.carts.lockCart(customerCart.id, transaction);
      await this.carts.lockCart(activeGuest.id, transaction);
      for (const source of activeGuest.items) {
        const existing = customerCart.items.find((target) =>
          source.inventoryUnitId === null
            ? target.inventoryUnitId === null && target.variantId === source.variantId
            : target.inventoryUnitId === source.inventoryUnitId,
        );
        if (existing === undefined) {
          const created = await transaction.cartItem.create({
            data: {
              cartId: customerCart.id,
              variantId: source.variantId,
              inventoryUnitId: source.inventoryUnitId,
              quantity: source.quantity,
              priceAtAddition: source.priceAtAddition,
            },
          });
          customerCart.items.push(created);
        } else if (source.inventoryUnitId === null) {
          const uncapped = existing.quantity + source.quantity;
          const quantity = Math.min(99, uncapped);
          await transaction.cartItem.update({ where: { id: existing.id }, data: { quantity } });
          existing.quantity = quantity;
          if (quantity !== uncapped) cappedItemIds.add(existing.id);
        }
      }
      await touchCart(customerCart.id, transaction);
      await transaction.cart.update({
        where: { id: activeGuest.id },
        data: { status: 'ABANDONED' },
      });
      return customerCart.id;
    });
    if (cartId === null) return emptyCart();
    const cart = await this.carts.findActiveById(cartId);
    if (cart === null) return emptyCart();
    return this.project(cart, cappedItemIds);
  }

  private resolveIdentity(auth: AuthContext | undefined, request: Request): CartIdentity {
    if (auth !== undefined) {
      if (auth.role !== 'CUSTOMER') throw new ApiError('FORBIDDEN');
      return { customerId: auth.userId };
    }
    const guestToken = this.guestIdentity.readToken(request);
    return guestToken === undefined
      ? {}
      : { guestToken, guestTokenHash: this.guestIdentity.digestToken(guestToken) };
  }

  private findActive(identity: CartIdentity, client?: Prisma.TransactionClient) {
    if (identity.customerId !== undefined) {
      return this.carts.findActiveForCustomer(identity.customerId, client);
    }
    if (identity.guestTokenHash !== undefined) {
      return this.carts.findActiveForGuest(identity.guestTokenHash, client);
    }
    return Promise.resolve(null);
  }

  private async findExistingActive(
    identity: CartIdentity,
    transaction: Prisma.TransactionClient,
  ): Promise<CartRecord> {
    const cart = await this.findActive(identity, transaction);
    if (cart === null) throw new ApiError('RESOURCE_NOT_FOUND');
    if (this.isExpired(cart)) {
      await transaction.cart.update({ where: { id: cart.id }, data: { status: 'EXPIRED' } });
      throw new ApiError('CART_NOT_ACTIVE');
    }
    return cart;
  }

  private async findOrCreateActive(
    identity: CartIdentity,
    transaction: Prisma.TransactionClient,
  ): Promise<CartRecord> {
    const existing = await this.findActive(identity, transaction);
    if (existing !== null && !this.isExpired(existing)) return existing;
    if (existing !== null) {
      await transaction.cart.update({ where: { id: existing.id }, data: { status: 'EXPIRED' } });
    }
    if (identity.customerId !== undefined) {
      return this.carts.createCustomer(identity.customerId, transaction);
    }
    if (identity.guestTokenHash === undefined) throw new ApiError('INTERNAL_ERROR');
    return this.carts.createGuest(
      identity.guestTokenHash,
      new Date(Date.now() + this.config.auth.guestCartTtlDays * 86_400_000),
      transaction,
    );
  }

  private async resolveOfferForAdd(
    input: AddCartItemDto,
    transaction: Prisma.TransactionClient,
  ): Promise<CommerceOffer> {
    if (
      (input.itemType === 'IPHONE' &&
        (input.inventoryCode === undefined ||
          input.variantId !== undefined ||
          input.quantity !== undefined)) ||
      (input.itemType === 'ACCESSORY' &&
        (input.inventoryCode !== undefined ||
          input.variantId === undefined ||
          input.quantity === undefined))
    ) {
      throw new ApiError('VALIDATION_FAILED');
    }
    const offer =
      input.itemType === 'IPHONE'
        ? await this.offers.findIphoneByInventoryCode(input.inventoryCode as string, transaction)
        : await this.offers.findAccessoryByVariantId(input.variantId as string, transaction);
    if (
      offer === null ||
      offer.itemType !== input.itemType ||
      offer.availabilityStatus !== 'AVAILABLE' ||
      offer.currentUnitPrice === null ||
      (input.itemType === 'ACCESSORY' &&
        (offer.availableQuantity ?? 0) < (input.quantity as number))
    ) {
      throw new ApiError(offer === null ? 'RESOURCE_NOT_FOUND' : 'INVENTORY_NOT_AVAILABLE');
    }
    return offer;
  }

  private isExpired(cart: CartRecord): boolean {
    return cart.expiresAt !== null && cart.expiresAt <= new Date();
  }

  private async project(cart: CartRecord, cappedItemIds = new Set<string>()): Promise<CartDto> {
    const offerMap = await this.offers.readOffers(
      cart.items.map((item) => ({
        variantId: item.variantId,
        inventoryUnitId: item.inventoryUnitId,
      })),
    );
    let subtotal = 0n;
    const allWarnings = new Set<CartWarning>();
    const items: CartItemDto[] = cart.items.map((item) => {
      const offer = offerMap.get(offerKey(item.variantId, item.inventoryUnitId));
      const warnings: CartWarning[] = [];
      const currentPrice = offer?.currentUnitPrice ?? null;
      if (currentPrice !== null && currentPrice !== item.priceAtAddition.toString()) {
        warnings.push('PRICE_CHANGED');
      }
      if (offer === undefined || offer.availabilityStatus !== 'AVAILABLE') {
        warnings.push('ITEM_UNAVAILABLE');
      } else if (item.inventoryUnitId === null && (offer.availableQuantity ?? 0) < item.quantity) {
        warnings.push('QUANTITY_NOT_AVAILABLE');
      }
      if (cappedItemIds.has(item.id)) warnings.push('QUANTITY_CAPPED_ON_MERGE');
      const valid = warnings.every(
        (warning) => warning === 'PRICE_CHANGED' || warning === 'QUANTITY_CAPPED_ON_MERGE',
      );
      const lineTotal =
        valid && currentPrice !== null ? BigInt(currentPrice) * BigInt(item.quantity) : null;
      if (lineTotal !== null) subtotal += lineTotal;
      for (const warning of warnings) allWarnings.add(warning);
      return {
        id: item.id,
        itemType: item.inventoryUnitId === null ? 'ACCESSORY' : 'IPHONE',
        quantity: item.quantity,
        target: {
          productId: offer?.productId ?? '',
          productSlug: offer?.productSlug ?? '',
          productName: offer?.productName ?? 'Sản phẩm không còn khả dụng',
          variantId: item.variantId,
          variantName: offer?.variantName ?? 'Phiên bản không còn khả dụng',
          ...(offer?.inventoryCode === undefined ? {} : { inventoryCode: offer.inventoryCode }),
        },
        media: offer?.media ?? null,
        priceAtAddition: item.priceAtAddition.toString(),
        currentUnitPrice: currentPrice,
        estimatedLineTotal: lineTotal?.toString() ?? null,
        availabilityStatus: offer?.availabilityStatus ?? 'INACTIVE',
        warnings,
      };
    });
    return {
      id: cart.id,
      status: cart.status,
      expiresAt: cart.expiresAt,
      items,
      estimatedSubtotal: subtotal.toString(),
      warnings: [...allWarnings],
    };
  }
}

function emptyCart(): CartDto {
  return {
    id: null,
    status: 'ACTIVE',
    expiresAt: null,
    items: [],
    estimatedSubtotal: '0',
    warnings: [],
  };
}

function identityKey(identity: CartIdentity): string {
  if (identity.customerId !== undefined) return `customer:${identity.customerId}`;
  if (identity.guestTokenHash !== undefined) return `guest:${identity.guestTokenHash}`;
  throw new ApiError('INTERNAL_ERROR');
}

function requireExistingIdentity(identity: CartIdentity): void {
  if (identity.customerId === undefined && identity.guestTokenHash === undefined) {
    throw new ApiError('RESOURCE_NOT_FOUND');
  }
}

function touchCart(cartId: string, transaction: Prisma.TransactionClient): Promise<unknown> {
  return transaction.cart.update({
    where: { id: cartId },
    data: { updatedAt: new Date() },
    select: { id: true },
  });
}
