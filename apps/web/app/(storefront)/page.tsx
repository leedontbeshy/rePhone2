import type { Metadata } from 'next';
import { Home } from '@/components/storefront/home';
import { listAllPublicProducts, listPublicUnits } from '@/lib/catalog-api';

export const metadata: Metadata = {
  title: 'rePhone — Chọn dòng iPhone',
  description:
    'Khám phá các dòng iPhone và xem giá thấp nhất từ những chiếc máy đang có sẵn tại rePhone.',
};

interface HomePageProps {
  readonly searchParams: Promise<Readonly<Record<string, string | string[] | undefined>>>;
}

export default async function HomePage({ searchParams }: HomePageProps) {
  const { generation } = await searchParams;
  const [products, units, featured] = await Promise.allSettled([
    listAllPublicProducts({
      productType: 'IPHONE',
      sortBy: 'releaseYear',
      sortOrder: 'desc',
    }),
    listPublicUnits(24),
    listPublicUnits(10, true),
  ]);
  return (
    <Home
      products={products.status === 'fulfilled' ? products.value : []}
      catalogUnavailable={products.status === 'rejected'}
      generation={generation}
      units={units.status === 'fulfilled' ? units.value : []}
      featuredUnits={featured.status === 'fulfilled' ? featured.value : []}
      unitsUnavailable={units.status === 'rejected'}
    />
  );
}
