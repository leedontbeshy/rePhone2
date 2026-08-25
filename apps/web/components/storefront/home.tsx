import Link from 'next/link';
import { Price } from '../ui';
import type { ProductListItem } from '@/lib/catalog-api';
import type { PublicStore } from '@/lib/public-store-api';
import { HomeMedia } from './home-media';
import { StoreSummary } from './store-summary';
import styles from './home.module.css';

interface HomeProps {
  readonly products: readonly ProductListItem[];
  readonly catalogUnavailable: boolean;
  readonly store?: PublicStore | undefined;
}

export function Home({ products, catalogUnavailable, store }: Readonly<HomeProps>) {
  return (
    <div className={styles.home}>
      <section className={styles.hero} aria-labelledby="home-title">
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}>iPhone cũ minh bạch</p>
          <h1 id="home-title">Biết rõ chiếc máy trước khi xuống tiền.</h1>
          <p>
            Ảnh thật, tình trạng pin, ngoại hình và 18 hạng mục kiểm định của đúng chiếc iPhone bạn
            sẽ nhận.
          </p>
          <div className={styles.heroActions}>
            <Link className={styles.primaryAction} href="/products?productType=IPHONE&inStock=true">
              Xem máy đang bán
            </Link>
            <Link className={styles.secondaryAction} href="/#quy-trinh">
              Xem cách chọn máy
            </Link>
          </div>
        </div>

        <aside className={styles.discoveryGuide} aria-label="Ba lớp thông tin khi chọn máy">
          <p className={styles.guideTitle}>Từ dòng máy đến chiếc máy cụ thể</p>
          <ol>
            <li>
              <span>01</span>
              <div>
                <strong>Dòng máy</strong>
                <p>Khám phá cấu hình và các lựa chọn đang có.</p>
              </div>
            </li>
            <li>
              <span>02</span>
              <div>
                <strong>Mã máy</strong>
                <p>Chọn đúng chiếc iPhone vật lý bạn muốn nhận.</p>
              </div>
            </li>
            <li>
              <span>03</span>
              <div>
                <strong>Hồ sơ kiểm định</strong>
                <p>Đối chiếu ảnh, pin, ngoại hình và kết quả từng hạng mục.</p>
              </div>
            </li>
          </ol>
        </aside>
      </section>

      <section className={styles.catalogSection} aria-labelledby="available-products-title">
        <div className={styles.sectionHeading}>
          <div>
            <p className={styles.eyebrow}>Khám phá theo model</p>
            <h2 id="available-products-title">Các dòng iPhone đang có máy</h2>
          </div>
          <Link href="/products?productType=IPHONE&inStock=true">Xem toàn bộ catalog</Link>
        </div>

        {catalogUnavailable ? (
          <div className={styles.catalogState} role="status">
            <h3>Catalog đang tạm gián đoạn</h3>
            <p>Bạn có thể thử mở lại danh sách sản phẩm sau ít phút.</p>
            <Link className={styles.secondaryAction} href="/products">
              Thử tải catalog
            </Link>
          </div>
        ) : products.length === 0 ? (
          <div className={styles.catalogState}>
            <h3>Chưa có iPhone phù hợp</h3>
            <p>Catalog hiện chưa có dòng iPhone nào còn máy công khai.</p>
          </div>
        ) : (
          <div className={styles.productGrid}>
            {products.map((product) => (
              <article className={styles.productCard} key={product.id}>
                <Link
                  className={styles.mediaLink}
                  href={`/products/${product.slug}`}
                  aria-label={`Xem dòng máy ${product.name}`}
                >
                  <HomeMedia media={product.coverMedia} productName={product.name} />
                </Link>
                <div className={styles.productBody}>
                  <div className={styles.productMeta}>
                    <span>{product.releaseYear ?? product.brand}</span>
                    <span>Có máy đang bán</span>
                  </div>
                  <h3>
                    <Link href={`/products/${product.slug}`}>{product.name}</Link>
                  </h3>
                  <p className={styles.productOptions}>
                    {product.storageOptions.length === 0
                      ? 'Xem cấu hình hiện có'
                      : product.storageOptions.map((value) => `${String(value)} GB`).join(' · ')}
                  </p>
                  <div className={styles.productFooter}>
                    <div>
                      <span>Giá từ</span>
                      {product.price.fromPrice === undefined ? (
                        <strong>Xem từng máy</strong>
                      ) : (
                        <Price className={styles.homePrice} amount={product.price.fromPrice} />
                      )}
                    </div>
                    <Link href={`/products/${product.slug}`}>Xem dòng máy</Link>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section id="quy-trinh" className={styles.processSection} aria-labelledby="process-title">
        <div className={styles.sectionHeading}>
          <div>
            <p className={styles.eyebrow}>Quy trình chọn máy</p>
            <h2 id="process-title">Model giúp khám phá. Mã máy giúp quyết định.</h2>
          </div>
        </div>
        <div className={styles.processGrid}>
          <article>
            <span>01</span>
            <h3>Chọn dòng iPhone</h3>
            <p>So sánh model, dung lượng, màu và mức giá bắt đầu.</p>
          </article>
          <article>
            <span>02</span>
            <h3>Chọn đúng chiếc máy</h3>
            <p>Mỗi mã máy dẫn tới ảnh, giá và tình trạng của một chiếc iPhone cụ thể.</p>
          </article>
          <article>
            <span>03</span>
            <h3>Đọc hồ sơ kiểm định</h3>
            <p>Xem pin, ngoại hình, sửa chữa đã biết và 18 hạng mục chức năng.</p>
          </article>
          <article>
            <span>04</span>
            <h3>Chọn cách nhận hàng</h3>
            <p>Khả năng pickup và giao hàng được hiển thị theo dữ liệu hiện hành.</p>
          </article>
        </div>
      </section>

      <section className={styles.storeSection} aria-labelledby="home-store-title">
        <div className={styles.sectionHeading}>
          <div>
            <p className={styles.eyebrow}>Thông tin pickup</p>
            <h2 id="home-store-title">Cửa hàng và điểm nhận máy</h2>
          </div>
        </div>
        {store === undefined ? (
          <div className={styles.catalogState} role="status">
            <h3>Chưa tải được thông tin cửa hàng</h3>
            <p>Địa chỉ và thông tin pickup đang tạm không khả dụng.</p>
            <Link className={styles.secondaryAction} href="/store">
              Mở trang cửa hàng
            </Link>
          </div>
        ) : (
          <StoreSummary store={store} compact />
        )}
      </section>
    </div>
  );
}
