'use client';

import { CatalogHeader } from '../catalog-ui';

export default function ProductsError({ reset }: { error: Error; reset: () => void }) {
  return (
    <>
      <CatalogHeader />
      <main className="catalog-shell">
        <section className="empty-state error-state">
          <h1>Không thể tải sản phẩm</h1>
          <p>Dịch vụ catalog đang tạm gián đoạn. Vui lòng thử lại sau ít phút.</p>
          <button className="button primary" type="button" onClick={reset}>
            Thử lại
          </button>
        </section>
      </main>
    </>
  );
}
