import type { Request } from 'express';
import { describe, expect, it, vi } from 'vitest';
import type { AppConfig } from '../../config/app-config.js';
import type { SerializableTransactionRunner } from '../../database/serializable-transaction.runner.js';
import type { Prisma } from '../../generated/prisma/client.js';
import type { AuthContext } from '../auth/auth-context.js';
import type { GuestCartIdentityService } from '../auth/guest-cart-identity.service.js';
import {
  offerKey,
  type CommerceOffer,
  type CommerceOfferReader,
} from '../catalog/commerce-offer.reader.js';
import type { CartRecord, CartRepository } from './cart.repository.js';
import { CartService } from './cart.service.js';

const CUSTOMER_ID = '00000000-0000-4000-8000-000000000001';
const CUSTOMER_CART_ID = '00000000-0000-4000-8000-000000000002';
const GUEST_CART_ID = '00000000-0000-4000-8000-000000000003';
const VARIANT_ID = '00000000-0000-4000-8000-000000000004';
const ITEM_ID = '00000000-0000-4000-8000-000000000005';

describe('CartService merge', () => {
  it('keeps capped warnings scoped to the transaction attempt that commits', async () => {
    const customerCart = cart(CUSTOMER_CART_ID, 70);
    const guestCart = cart(GUEST_CART_ID, 70);
    const findActiveForGuest = vi
      .fn<() => Promise<CartRecord | null>>()
      .mockResolvedValueOnce(guestCart)
      .mockResolvedValueOnce(null);
    const repository = {
      lockIdentity: vi.fn(() => Promise.resolve(undefined)),
      lockCart: vi.fn(() => Promise.resolve(undefined)),
      findActiveForCustomer: vi.fn(() => Promise.resolve(customerCart)),
      findActiveForGuest,
      findActiveById: vi.fn(() => Promise.resolve(customerCart)),
    } as unknown as CartRepository;
    const transaction = {
      cartItem: {
        create: vi.fn(),
        update: vi.fn(() => Promise.resolve(undefined)),
      },
      cart: {
        update: vi.fn(() => Promise.resolve(undefined)),
      },
    } as unknown as Prisma.TransactionClient;
    const runner = {
      run: vi.fn(
        async <T>(
          _operation: string,
          work: (client: Prisma.TransactionClient) => Promise<T>,
        ): Promise<T> => {
          await work(transaction);
          return work(transaction);
        },
      ),
    } as unknown as SerializableTransactionRunner;
    const offer = accessoryOffer();
    const offers = {
      readOffers: vi.fn(() =>
        Promise.resolve(new Map([[offerKey(offer.variantId, offer.inventoryUnitId), offer]])),
      ),
    } as unknown as CommerceOfferReader;
    const guestIdentity = {
      readToken: vi.fn(() => 'guest-token'),
      digestToken: vi.fn(() => 'guest-token-hash'),
    } as unknown as GuestCartIdentityService;
    const service = new CartService(repository, offers, runner, guestIdentity, {} as AppConfig);

    const result = await service.merge(
      { userId: CUSTOMER_ID, role: 'CUSTOMER', sessionId: 'session-a' } satisfies AuthContext,
      {} as Request,
    );

    expect(findActiveForGuest).toHaveBeenCalledTimes(2);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({ quantity: 99, warnings: [] });
    expect(result.warnings).toEqual([]);
  });
});

function cart(id: string, quantity: number): CartRecord {
  return {
    id,
    status: 'ACTIVE',
    expiresAt: null,
    items: [
      {
        id: ITEM_ID,
        cartId: id,
        variantId: VARIANT_ID,
        inventoryUnitId: null,
        quantity,
        priceAtAddition: '100000',
      },
    ],
  } as unknown as CartRecord;
}

function accessoryOffer(): CommerceOffer {
  return {
    itemType: 'ACCESSORY',
    productId: '00000000-0000-4000-8000-000000000006',
    productSlug: 'op-lung-demo',
    productName: 'Ốp lưng Demo',
    productType: 'ACCESSORY',
    variantId: VARIANT_ID,
    variantName: 'Màu đen',
    currentUnitPrice: '100000',
    availabilityStatus: 'AVAILABLE',
    availableQuantity: 200,
    media: null,
  };
}
