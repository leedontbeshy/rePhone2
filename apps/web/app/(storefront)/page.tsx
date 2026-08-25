import type { Metadata } from 'next';
import { Home } from '@/components/storefront/home';
import { listPublicProducts } from '@/lib/catalog-api';
import { getPublicStore } from '@/lib/public-store-api';

export const metadata: Metadata = {
  title: 'rePhone — Biết rõ chiếc máy trước khi xuống tiền',
  description:
    'Khám phá iPhone cũ theo từng máy với ảnh, pin, ngoại hình và hồ sơ kiểm định công khai.',
};

export default async function HomePage() {
  const [catalogResult, storeResult] = await Promise.allSettled([
    listPublicProducts({
      productType: 'IPHONE',
      inStock: true,
      page: 1,
      pageSize: 6,
      sortBy: 'name',
      sortOrder: 'asc',
    }),
    getPublicStore(),
  ]);

  return (
    <Home
      products={catalogResult.status === 'fulfilled' ? catalogResult.value.data : []}
      catalogUnavailable={catalogResult.status === 'rejected'}
      store={storeResult.status === 'fulfilled' ? storeResult.value : undefined}
    />
  );
}
