import { getPublicStore } from '@/lib/public-store-api';
import { getStorefrontFooterConfig } from '@/lib/storefront-footer-config';
import { StorefrontFooter, type StorefrontFooterStore } from './storefront-footer';

export async function StorefrontFooterData() {
  let store: StorefrontFooterStore | null = null;

  try {
    const publicStore = await getPublicStore();
    store = {
      storeAddress: publicStore.storeAddress,
      storeName: publicStore.storeName,
      storePhone: publicStore.storePhone,
    };
  } catch {
    // Store contact is supplementary. Core footer navigation remains available on provider failure.
  }

  return <StorefrontFooter config={getStorefrontFooterConfig()} store={store} />;
}
