import { describe, expect, it } from 'vitest';
import type { CartItem } from '@/app/commerce-provider';
import {
  cartItemHref,
  cartWarningLabel,
  isBlockingCartWarning,
  wishlistAccessoryQuantity,
} from './cart-wishlist-presenter';

describe('cart and wishlist presenter', () => {
  it('blocks checkout only for unavailable items or insufficient quantity', () => {
    expect(isBlockingCartWarning('ITEM_UNAVAILABLE')).toBe(true);
    expect(isBlockingCartWarning('QUANTITY_NOT_AVAILABLE')).toBe(true);
    expect(isBlockingCartWarning('PRICE_CHANGED')).toBe(false);
    expect(isBlockingCartWarning('QUANTITY_CAPPED_ON_MERGE')).toBe(false);
  });

  it('uses natural Vietnamese warning labels', () => {
    expect(cartWarningLabel('PRICE_CHANGED')).toContain('Giá sản phẩm đã thay đổi');
    expect(cartWarningLabel('QUANTITY_CAPPED_ON_MERGE')).not.toMatch(/merge|cap|quantity/i);
  });

  it('keeps exact-unit links for iPhone items', () => {
    const item = {
      target: { inventoryCode: 'IP13-0001', productSlug: 'iphone-13' },
    } as CartItem;
    expect(cartItemHref(item)).toBe('/products/iphone-13/units/IP13-0001');
  });

  it('links accessory items to their product page', () => {
    const item = { target: { productSlug: 'op-lung-magsafe' } } as CartItem;
    expect(cartItemHref(item)).toBe('/products/op-lung-magsafe');
  });

  it('keeps the quantity of an accessory that is already in the cart', () => {
    const cart = {
      items: [
        {
          itemType: 'ACCESSORY',
          quantity: 4,
          target: { variantId: 'variant-existing' },
        },
      ],
    } as Parameters<typeof wishlistAccessoryQuantity>[0];

    expect(wishlistAccessoryQuantity(cart, 'variant-existing')).toBe(4);
    expect(wishlistAccessoryQuantity(cart, 'variant-new')).toBe(1);
    expect(wishlistAccessoryQuantity(null, 'variant-new')).toBe(1);
  });
});
