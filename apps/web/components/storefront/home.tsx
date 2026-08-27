import type { ProductListItem } from '@/lib/catalog-api';
import { CatalogTrustStrip } from './catalog-trust-strip';
import { IphoneGenerationCatalog } from './iphone-generation-catalog';
import styles from './home.module.css';

interface HomeProps {
  readonly products: readonly ProductListItem[];
  readonly catalogUnavailable: boolean;
}

export function Home({ products, catalogUnavailable }: Readonly<HomeProps>) {
  return (
    <div className={styles.home}>
      <header className={styles.introduction}>
        <h1>Chọn iPhone phù hợp với bạn</h1>
        <p>Chọn dòng máy, sau đó xem từng chiếc đang có sẵn.</p>
      </header>

      <IphoneGenerationCatalog products={products} unavailable={catalogUnavailable} />
      <CatalogTrustStrip />
    </div>
  );
}
