import Link from 'next/link';
import { CatalogHeader, Availability, MediaImage, Money } from '../catalog-ui';
import { CatalogApiError, listPublicProducts } from '../../lib/catalog-api';
import {
  catalogPageHref,
  searchParamValue,
  toCatalogListQuery,
  type CatalogSearchParams,
} from '../../lib/catalog-query';

interface ProductsPageProps {
  searchParams: Promise<CatalogSearchParams>;
}

export default async function ProductsPage({ searchParams }: ProductsPageProps) {
  const current = await searchParams;
  try {
    const response = await listPublicProducts(toCatalogListQuery(current));
    const pagination = response.meta.pagination;
    return (
      <>
        <CatalogHeader />
        <main className="catalog-shell">
          <section className="catalog-hero">
            <p className="eyebrow">Catalog công khai</p>
            <h1>Chọn đúng chiếc iPhone dành cho bạn.</h1>
            <p>
              Xem ảnh thật, tình trạng pin, kiểm định và bảo hành của từng máy trước khi quyết định.
            </p>
          </section>

          <form className="catalog-filters" action="/products" method="get">
            <label className="filter-wide">
              Tìm kiếm
              <input
                name="q"
                type="search"
                maxLength={100}
                defaultValue={searchParamValue(current, 'q')}
                placeholder="Tên máy, cấu hình hoặc SKU"
              />
            </label>
            <label>
              Loại sản phẩm
              <select
                name="productType"
                defaultValue={searchParamValue(current, 'productType') ?? ''}
              >
                <option value="">Tất cả</option>
                <option value="IPHONE">iPhone</option>
                <option value="ACCESSORY">Phụ kiện</option>
              </select>
            </label>
            <label>
              Dung lượng
              <select
                name="storageCapacityGb"
                defaultValue={searchParamValue(current, 'storageCapacityGb') ?? ''}
              >
                <option value="">Tất cả</option>
                <option value="128">128 GB</option>
                <option value="256">256 GB</option>
                <option value="512">512 GB</option>
              </select>
            </label>
            <label>
              Màu
              <input name="colorName" defaultValue={searchParamValue(current, 'colorName')} />
            </label>
            <label>
              Giá từ
              <input
                name="minPrice"
                inputMode="numeric"
                pattern="[0-9]+"
                defaultValue={searchParamValue(current, 'minPrice')}
              />
            </label>
            <label>
              Giá đến
              <input
                name="maxPrice"
                inputMode="numeric"
                pattern="[0-9]+"
                defaultValue={searchParamValue(current, 'maxPrice')}
              />
            </label>
            <label>
              Tình trạng tồn
              <select name="inStock" defaultValue={searchParamValue(current, 'inStock') ?? ''}>
                <option value="">Tất cả</option>
                <option value="true">Còn hàng</option>
                <option value="false">Tạm hết hàng</option>
              </select>
            </label>
            <label>
              Sắp xếp
              <select
                name="sortBy"
                defaultValue={searchParamValue(current, 'sortBy') ?? 'createdAt'}
              >
                <option value="createdAt">Mới cập nhật</option>
                <option value="name">Tên</option>
                <option value="fromPrice">Giá</option>
                <option value="releaseYear">Năm ra mắt</option>
              </select>
            </label>
            <label>
              Thứ tự
              <select
                name="sortOrder"
                defaultValue={searchParamValue(current, 'sortOrder') ?? 'desc'}
              >
                <option value="desc">Giảm dần</option>
                <option value="asc">Tăng dần</option>
              </select>
            </label>
            <input type="hidden" name="pageSize" value={pagination.pageSize} />
            <div className="filter-actions">
              <button className="button primary" type="submit">
                Áp dụng
              </button>
              <Link className="button" href="/products">
                Xóa lọc
              </Link>
            </div>
          </form>

          <div className="catalog-summary" aria-live="polite">
            <strong>{pagination.totalItems} sản phẩm</strong>
            <span>
              Trang {pagination.page}/{Math.max(pagination.totalPages, 1)}
            </span>
          </div>

          {response.data.length === 0 ? (
            <section className="empty-state">
              <h2>Chưa tìm thấy sản phẩm phù hợp</h2>
              <p>Hãy thử bỏ bớt bộ lọc hoặc tìm bằng tên khác.</p>
            </section>
          ) : (
            <section className="product-grid" aria-label="Danh sách sản phẩm">
              {response.data.map((product) => (
                <article className="product-card" key={product.id}>
                  <Link href={`/products/${product.slug}`} aria-label={`Xem ${product.name}`}>
                    <MediaImage media={product.coverMedia} className="product-card-media" />
                  </Link>
                  <div className="product-card-body">
                    <div className="product-card-meta">
                      <span>{product.productType === 'IPHONE' ? 'iPhone cũ' : 'Phụ kiện'}</span>
                      <Availability available={product.inStock} />
                    </div>
                    <h2>
                      <Link href={`/products/${product.slug}`}>{product.name}</Link>
                    </h2>
                    <p className="product-price">
                      <small>Từ</small> <Money value={product.price.fromPrice} />
                    </p>
                    {product.storageOptions.length > 0 ? (
                      <p className="option-line">
                        {product.storageOptions.map((size) => `${String(size)} GB`).join(' · ')}
                      </p>
                    ) : null}
                    {product.colorOptions.length > 0 ? (
                      <p className="option-line">{product.colorOptions.join(' · ')}</p>
                    ) : null}
                  </div>
                </article>
              ))}
            </section>
          )}

          {pagination.totalPages > 1 ? (
            <nav className="pagination" aria-label="Phân trang catalog">
              {pagination.page > 1 ? (
                <Link className="button" href={catalogPageHref(current, pagination.page - 1)}>
                  Trang trước
                </Link>
              ) : (
                <span />
              )}
              {pagination.page < pagination.totalPages ? (
                <Link className="button" href={catalogPageHref(current, pagination.page + 1)}>
                  Trang sau
                </Link>
              ) : null}
            </nav>
          ) : null}
        </main>
      </>
    );
  } catch (error) {
    return (
      <>
        <CatalogHeader />
        <main className="catalog-shell">
          <section className="empty-state error-state">
            <h1>Không thể tải catalog</h1>
            <p>
              {error instanceof CatalogApiError
                ? error.message
                : 'Đã xảy ra lỗi không mong đợi. Vui lòng thử lại.'}
            </p>
            <Link className="button" href="/products">
              Thử lại
            </Link>
          </section>
        </main>
      </>
    );
  }
}
