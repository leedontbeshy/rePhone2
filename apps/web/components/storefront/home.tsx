import Link from 'next/link';
import { ExactUnitCard } from '@/components/catalog/exact-unit-card';
import { IphoneModelCard } from '@/components/catalog/iphone-model-card';
import type { ProductListItem, PublicUnitOffer } from '@/lib/catalog-api';
import { groupIphoneModels } from '@/lib/iphone-model-groups';
import { CatalogTrustStrip } from './catalog-trust-strip';
import { FeaturedModelBento } from './featured-model-bento';
import { FeaturedUnitsCarousel } from './featured-units-carousel';
import { HomePromotions } from './home-promotions';
import styles from './home.module.css';

interface HomeProps {
  readonly products: readonly ProductListItem[];
  readonly catalogUnavailable: boolean;
  readonly generation?: string | readonly string[] | undefined;
  readonly units?: readonly PublicUnitOffer[];
  readonly featuredUnits?: readonly PublicUnitOffer[];
  readonly unitsUnavailable?: boolean;
}

export function Home({
  products,
  catalogUnavailable,
  generation,
  units = [],
  featuredUnits = [],
  unitsUnavailable = false,
}: Readonly<HomeProps>) {
  const groups = groupIphoneModels(products);
  const selected =
    typeof generation === 'string' ? groups.find((group) => group.id === generation) : undefined;
  const visibleGroups =
    selected === undefined
      ? groups.filter((group) => /^iphone-(18|17|16|15|14)$/.test(group.id))
      : [selected];
  return (
    <div className={styles.layout}>
      <HomePromotions side="left" />
      <div className={styles.home}>
        <header className={styles.introduction}>
          <h1>Chọn iPhone phù hợp với bạn</h1>
          <p>Ảnh thật, giá rõ. Xem máy bạn thích ngay bên dưới.</p>
        </header>
        <FeaturedModelBento products={groups.flatMap((group) => group.products)} />
        <nav className={styles.generations} aria-label="Chọn thế hệ iPhone">
          <ul>
            {[18, 17, 16, 15, 14, 13, 12].map((number) => {
              const id = `iphone-${String(number)}`;
              const available = groups.some((group) => group.id === id);
              return (
                <li key={id}>
                  <Link
                    href={
                      available
                        ? `/?generation=${id}#iphone-models`
                        : `/products?q=${encodeURIComponent(`iPhone ${String(number)}`)}`
                    }
                    aria-current={selected?.id === id ? 'page' : undefined}
                    prefetch={false}
                  >
                    iPhone {number}
                  </Link>
                </li>
              );
            })}
            <li>
              <Link href="/products" prefetch={false}>
                Khác
              </Link>
            </li>
          </ul>
        </nav>
        <FeaturedUnitsCarousel offers={featuredUnits} />
        <section className={styles.results} aria-labelledby="available-units-title">
          <div className={styles.sectionHeading}>
            <div>
              <p className={styles.eyebrow}>Sẵn sàng về tay bạn</p>
              <h2 id="available-units-title">iPhone đang bán</h2>
            </div>
            <Link className={styles.moreLink} href="/products?productType=IPHONE&inStock=true">
              Xem thêm máy
            </Link>
          </div>
          {unitsUnavailable ? (
            <p role="status">Chưa tải được máy đang bán. Vui lòng tải lại trang.</p>
          ) : units.length === 0 ? (
            <p>Máy mới sẽ được cập nhật tại đây khi sẵn sàng bán.</p>
          ) : (
            <div className={styles.unitGrid}>
              {units.map((offer) => (
                <ExactUnitCard key={offer.unit.inventoryCode} {...offer} layout="stacked" />
              ))}
            </div>
          )}
        </section>
        <section
          className={styles.results}
          id="iphone-models"
          aria-labelledby="iphone-models-title"
        >
          <div className={styles.sectionHeading}>
            <h2 id="iphone-models-title">Khám phá theo dòng iPhone</h2>
            {selected === undefined ? null : <Link href="/#iphone-models">Tất cả dòng máy</Link>}
          </div>
          {catalogUnavailable ? (
            <section className={styles.state} role="status">
              <h3>Danh mục đang tạm gián đoạn</h3>
              <a href="/">Tải lại danh mục</a>
            </section>
          ) : groups.length === 0 ? (
            <p>Chưa có dòng iPhone nào trong danh mục.</p>
          ) : (
            visibleGroups.map((group) => (
              <section
                className={styles.family}
                key={group.id}
                aria-labelledby={`${group.id}-title`}
              >
                <div className={styles.sectionHeading}>
                  <h3 id={`${group.id}-title`}>{group.label}</h3>
                  <Link href={`/products?q=${encodeURIComponent(group.label)}`}>Xem dòng máy</Link>
                </div>
                <ul className={styles.modelGrid}>
                  {group.products.map((product) => (
                    <li key={product.id}>
                      <IphoneModelCard product={product} />
                    </li>
                  ))}
                </ul>
              </section>
            ))
          )}
          <div className={styles.moreRow}>
            <Link className={styles.moreLink} href="/products">
              Thêm dòng iPhone
            </Link>
          </div>
        </section>
        <CatalogTrustStrip />
      </div>
      <HomePromotions side="right" />
    </div>
  );
}
