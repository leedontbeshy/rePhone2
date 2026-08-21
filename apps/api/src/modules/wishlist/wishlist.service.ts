import { Inject, Injectable } from '@nestjs/common';
import { ApiError } from '../../common/errors/api-error.js';
import { SerializableTransactionRunner } from '../../database/serializable-transaction.runner.js';
import type { AuthContext } from '../auth/auth-context.js';
import {
  CommerceOfferReader,
  offerKey,
  type CommerceOffer,
} from '../catalog/commerce-offer.reader.js';
import type { AddWishlistItemDto } from './wishlist.dto.js';
import type { WishlistItemDto } from './wishlist-response.dto.js';
import { WishlistRepository } from './wishlist.repository.js';

export interface WishlistMutationResult {
  item: WishlistItemDto;
  created: boolean;
}

@Injectable()
export class WishlistService {
  public constructor(
    @Inject(WishlistRepository) private readonly wishlist: WishlistRepository,
    @Inject(CommerceOfferReader) private readonly offers: CommerceOfferReader,
    @Inject(SerializableTransactionRunner)
    private readonly transactions: SerializableTransactionRunner,
  ) {}

  public async list(auth: AuthContext): Promise<WishlistItemDto[]> {
    requireCustomer(auth);
    const items = await this.wishlist.list(auth.userId);
    const offerMap = await this.offers.readOffers(
      items.map((item) => ({
        variantId: item.variantId,
        inventoryUnitId: item.inventoryUnitId,
      })),
    );
    return items.map((item) => {
      const offer = offerMap.get(offerKey(item.variantId, item.inventoryUnitId));
      return projectWishlistItem(item, offer);
    });
  }

  public async add(auth: AuthContext, input: AddWishlistItemDto): Promise<WishlistMutationResult> {
    requireCustomer(auth);
    validateShape(input);
    const result = await this.transactions.run('wishlist.add-item', async (transaction) => {
      await this.wishlist.lockCustomer(auth.userId, transaction);
      const offer =
        input.itemType === 'IPHONE'
          ? await this.offers.findIphoneByInventoryCode(input.inventoryCode as string, transaction)
          : await this.offers.findAccessoryByVariantId(input.variantId as string, transaction);
      if (
        offer === null ||
        offer.itemType !== input.itemType ||
        offer.availabilityStatus !== 'AVAILABLE'
      ) {
        throw new ApiError(offer === null ? 'RESOURCE_NOT_FOUND' : 'INVENTORY_NOT_AVAILABLE');
      }
      const existing = await transaction.wishlistItem.findFirst({
        where: {
          customerId: auth.userId,
          ...(offer.inventoryUnitId === undefined
            ? { variantId: offer.variantId, inventoryUnitId: null }
            : { inventoryUnitId: offer.inventoryUnitId }),
        },
      });
      if (existing !== null) return { item: existing, offer, created: false };
      const item = await transaction.wishlistItem.create({
        data: {
          customerId: auth.userId,
          variantId: offer.variantId,
          inventoryUnitId: offer.inventoryUnitId ?? null,
        },
      });
      return { item, offer, created: true };
    });
    return { item: projectWishlistItem(result.item, result.offer), created: result.created };
  }

  public async remove(auth: AuthContext, itemId: string): Promise<void> {
    requireCustomer(auth);
    await this.transactions.run('wishlist.remove-item', async (transaction) => {
      await this.wishlist.lockCustomer(auth.userId, transaction);
      const item = await transaction.wishlistItem.findFirst({
        where: { id: itemId, customerId: auth.userId },
        select: { id: true },
      });
      if (item === null) throw new ApiError('RESOURCE_NOT_FOUND');
      await transaction.wishlistItem.delete({ where: { id: item.id } });
    });
  }
}

function projectWishlistItem(
  item: {
    id: string;
    variantId: string;
    inventoryUnitId: string | null;
    createdAt: Date;
  },
  offer: CommerceOffer | undefined,
): WishlistItemDto {
  return {
    id: item.id,
    itemType: item.inventoryUnitId === null ? 'ACCESSORY' : 'IPHONE',
    target: {
      productId: offer?.productId ?? '',
      productSlug: offer?.productSlug ?? '',
      productName: offer?.productName ?? 'Sản phẩm không còn khả dụng',
      variantId: item.variantId,
      variantName: offer?.variantName ?? 'Phiên bản không còn khả dụng',
      ...(offer?.inventoryCode === undefined ? {} : { inventoryCode: offer.inventoryCode }),
    },
    media: offer?.media ?? null,
    currentUnitPrice: offer?.currentUnitPrice ?? null,
    availabilityStatus: offer?.availabilityStatus ?? 'INACTIVE',
    createdAt: item.createdAt,
  };
}

function requireCustomer(auth: AuthContext): void {
  if (auth.role !== 'CUSTOMER') throw new ApiError('FORBIDDEN');
}

function validateShape(input: AddWishlistItemDto): void {
  if (
    (input.itemType === 'IPHONE' &&
      (input.inventoryCode === undefined || input.variantId !== undefined)) ||
    (input.itemType === 'ACCESSORY' &&
      (input.inventoryCode !== undefined || input.variantId === undefined))
  ) {
    throw new ApiError('VALIDATION_FAILED');
  }
}
