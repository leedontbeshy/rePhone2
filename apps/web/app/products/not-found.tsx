import Link from 'next/link';
import { CatalogHeader } from '../catalog-ui';

export default function ProductNotFound() {
  return (
    <>
      <CatalogHeader />
      <main className="catalog-shell">
        <section className="empty-state">
          <p className="eyebrow">Không tìm thấy</p>
          <h1>Sản phẩm không còn công khai</h1>
          <p>Sản phẩm có thể đã ngừng bán hoặc đường dẫn không còn hợp lệ.</p>
          <Link className="button primary" href="/products">
            Quay lại catalog
          </Link>
        </section>
      </main>
    </>
  );
}
