import type { ProductListItem } from '@/lib/catalog-api';
import { groupIphoneModels } from '@/lib/iphone-model-groups';
import { IphoneGenerationSection } from './iphone-generation-section';
import styles from './iphone-generation-catalog.module.css';

interface IphoneGenerationCatalogProps {
  readonly products: readonly ProductListItem[];
  readonly unavailable: boolean;
}

export function IphoneGenerationCatalog({
  products,
  unavailable,
}: Readonly<IphoneGenerationCatalogProps>) {
  if (unavailable) {
    return (
      <section className={styles.state} aria-labelledby="catalog-unavailable-title" role="status">
        <h2 id="catalog-unavailable-title">Danh mục đang tạm gián đoạn</h2>
        <p>Bạn có thể thử tải lại sau ít phút.</p>
        <a href="/">Tải lại danh mục</a>
      </section>
    );
  }

  const groups = groupIphoneModels(products);
  if (groups.length === 0) {
    return (
      <section className={styles.state} aria-labelledby="catalog-empty-title">
        <h2 id="catalog-empty-title">Chưa có dòng iPhone nào</h2>
        <p>Danh mục công khai hiện chưa có dòng máy để hiển thị.</p>
      </section>
    );
  }

  const priorityProductId = groups[0]?.products.find(
    (product) => product.coverMedia !== undefined,
  )?.id;

  return (
    <div className={styles.catalog}>
      {groups.map((group) => (
        <IphoneGenerationSection
          key={group.id}
          group={group}
          priorityProductId={priorityProductId}
        />
      ))}
    </div>
  );
}
