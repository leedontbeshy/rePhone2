import { CartView } from '@/components/commerce/cart-view';
import { StorefrontFrame } from '@/components/storefront/storefront-frame';

export default function CartPage() {
  return (
    <StorefrontFrame>
      <CartView />
    </StorefrontFrame>
  );
}
