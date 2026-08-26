import Link from 'next/link';
import { CatalogApiError, listPublicProducts } from '@/lib/catalog-api';
import {
  catalogPageHref,
  searchParamValue,
  toCatalogListQuery,
  type CatalogSearchParams,
} from '@/lib/catalog-query';
import { CatalogFilterDialog } from '@/components/catalog/catalog-filter-dialog';
import { CatalogFilterForm } from '@/components/catalog/catalog-filter-form';
import { AccessoryProductCard } from '@/components/catalog/accessory-product-card';
import { IphoneModelCard } from '@/components/catalog/iphone-model-card';
import { toIphoneModelSummary } from '@/lib/iphone-model-groups';
import styles from '@/components/catalog/catalog.module.css';

interface ProductsPageProps {
  searchParams: Promise<CatalogSearchParams>;
}

export default async function ProductsPage({ searchParams }: ProductsPageProps) {
  const current = await searchParams;
  try {
    const response = await listPublicProducts(toCatalogListQuery(current));
    const pagination = response.meta.pagination;
    const activeFilterCount = [
      'q',
      'productType',
      'releaseYear',
      'storageCapacityGb',
      'colorName',
      'minPrice',
      'maxPrice',
      'inStock',
    ].filter((key) => searchParamValue(current, key) !== undefined).length;
    return (
      <div className={styles.page}>
        <section className={styles.hero}>
          <h1>Tìm iPhone và phụ kiện</h1>
          <p>Lọc theo dòng máy, dung lượng, màu sắc, giá và tình trạng còn hàng.</p>
        </section>

        <CatalogFilterDialog>
          <CatalogFilterForm
            current={current}
            idPrefix="mobile-catalog"
            pageSize={pagination.pageSize}
          />
        </CatalogFilterDialog>
        <div className={styles.desktopFilters}>
          <CatalogFilterForm
            current={current}
            idPrefix="desktop-catalog"
            pageSize={pagination.pageSize}
          />
        </div>

        <div className={styles.summaryRow} aria-live="polite">
          <strong>{pagination.totalItems} sản phẩm</strong>
          <span>
            {activeFilterCount > 0 ? `${String(activeFilterCount)} bộ lọc · ` : ''}Trang{' '}
            {String(pagination.page)}/{Math.max(pagination.totalPages, 1)}
          </span>
        </div>

        {response.data.length === 0 ? (
          <section className={styles.emptyState}>
            <h2>Chưa tìm thấy sản phẩm phù hợp</h2>
            <p>Hãy thử bỏ bớt bộ lọc hoặc tìm bằng tên khác.</p>
            <Link className={styles.clearFilter} href="/products">
              Xem toàn bộ catalog
            </Link>
          </section>
        ) : (
          <section className={styles.productGrid} aria-label="Danh sách sản phẩm">
            {response.data.map((product) =>
              product.productType === 'IPHONE' ? (
                <IphoneModelCard
                  key={product.id}
                  headingLevel={2}
                  product={toIphoneModelSummary(product)}
                />
              ) : (
                <AccessoryProductCard key={product.id} product={product} />
              ),
            )}
          </section>
        )}

        {pagination.totalPages > 1 ? (
          <nav className={styles.pagination} aria-label="Phân trang catalog">
            {pagination.page > 1 ? (
              <Link
                className={styles.paginationLink}
                href={catalogPageHref(current, pagination.page - 1)}
              >
                Trang trước
              </Link>
            ) : (
              <span />
            )}
            {pagination.page < pagination.totalPages ? (
              <Link
                className={styles.paginationLink}
                href={catalogPageHref(current, pagination.page + 1)}
              >
                Trang sau
              </Link>
            ) : null}
          </nav>
        ) : null}
      </div>
    );
  } catch (error) {
    return (
      <section className={styles.errorState}>
        <h1>Không thể tải catalog</h1>
        <p>
          {error instanceof CatalogApiError
            ? error.message
            : 'Đã xảy ra lỗi không mong đợi. Vui lòng thử lại.'}
        </p>
        <Link className={styles.clearFilter} href="/products">
          Thử lại
        </Link>
      </section>
    );
  }
}
