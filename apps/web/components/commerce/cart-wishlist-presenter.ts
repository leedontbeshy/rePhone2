import type { CartItem } from '@/app/commerce-provider';

export type CartWarning = CartItem['warnings'][number];

const BLOCKING_CART_WARNINGS = [
  'ITEM_UNAVAILABLE',
  'QUANTITY_NOT_AVAILABLE',
] as const satisfies readonly CartWarning[];

export function isBlockingCartWarning(warning: CartWarning): boolean {
  return (BLOCKING_CART_WARNINGS as readonly CartWarning[]).includes(warning);
}

export function cartWarningLabel(warning: CartWarning): string {
  return {
    PRICE_CHANGED: 'Giá sản phẩm đã thay đổi. Bạn hãy xem lại mức giá mới trước khi tiếp tục.',
    QUANTITY_NOT_AVAILABLE:
      'Số lượng bạn chọn hiện không còn đủ. Hãy giảm số lượng hoặc xóa sản phẩm này.',
    ITEM_UNAVAILABLE: 'Sản phẩm này hiện không còn sẵn. Bạn có thể chọn sản phẩm khác.',
    QUANTITY_CAPPED_ON_MERGE: 'Số lượng phụ kiện đã được điều chỉnh về mức tối đa 99 sản phẩm.',
  }[warning];
}

export function cartItemHref(item: CartItem): string {
  return item.target.inventoryCode
    ? `/products/${item.target.productSlug}/units/${item.target.inventoryCode}`
    : `/products/${item.target.productSlug}`;
}
