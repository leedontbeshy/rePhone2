import type { PublicMedia } from '@/lib/catalog-api';
import { ProductMediaGallery } from '@/components/catalog/product-media-gallery';

interface ActualUnitGalleryProps {
  readonly inventoryCode: string;
  readonly media: readonly PublicMedia[];
  readonly productName: string;
}

export function ActualUnitGallery({ inventoryCode, media, productName }: ActualUnitGalleryProps) {
  return (
    <ProductMediaGallery
      fallbackLabel={`Chưa có ảnh thật của ${productName}, mã máy ${inventoryCode}`}
      label={`Ảnh thật · Mã máy ${inventoryCode}`}
      media={media}
      priority
      variant="unit"
    />
  );
}
