import { notFound } from 'next/navigation';
import { UnitDossier } from '@/components/dossier/unit-dossier';
import { CatalogApiError, getPublicProduct, getPublicUsedIphone } from '@/lib/catalog-api';

interface UsedIphonePageProps {
  params: Promise<{ slug: string; inventoryCode: string }>;
}

export default async function UsedIphonePage({ params }: UsedIphonePageProps) {
  const { slug, inventoryCode } = await params;
  try {
    const [detail, product] = await Promise.all([
      getPublicUsedIphone(slug, inventoryCode),
      getPublicProduct(slug),
    ]);
    return <UnitDossier detail={detail} product={product} />;
  } catch (error) {
    if (error instanceof CatalogApiError && error.status === 404) {
      notFound();
    }
    throw error;
  }
}
