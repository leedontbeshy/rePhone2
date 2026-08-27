import type { Metadata } from 'next';
import { Home } from '@/components/storefront/home';
import { listAllPublicProducts } from '@/lib/catalog-api';

export const metadata: Metadata = {
  title: 'rePhone — Chọn dòng iPhone',
  description:
    'Khám phá các dòng iPhone và xem giá thấp nhất từ những chiếc máy đang có sẵn tại rePhone.',
};

export default async function HomePage() {
  try {
    const products = await listAllPublicProducts({
      productType: 'IPHONE',
      sortBy: 'releaseYear',
      sortOrder: 'desc',
    });

    return <Home products={products} catalogUnavailable={false} />;
  } catch {
    return <Home products={[]} catalogUnavailable />;
  }
}
