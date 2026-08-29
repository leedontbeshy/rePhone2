'use client';

import { CatalogVoucherShell } from '@/components/backoffice';
import { Skeleton } from '@/components/ui';
import styles from './page.module.css';

const METRIC_CARD_COUNT = 4;
const CONTENT_SECTION_COUNT = 2;

export default function BackofficeOverviewPage() {
  return (
    <CatalogVoucherShell breadcrumbs={[{ label: 'Vận hành' }, { label: 'Tổng quan' }]}>
      <div className={styles.page}>
        <header className={styles.heading}>
          <h1>Tổng quan vận hành</h1>
          <p>Các chỉ số và công việc cần chú ý sẽ được tổng hợp tại đây.</p>
        </header>

        <section
          aria-busy="true"
          aria-label="Dữ liệu tổng quan đang được chuẩn bị"
          className={styles.overview}
          role="status"
        >
          <span className="rp-visually-hidden">Dữ liệu tổng quan vận hành đang được chuẩn bị.</span>

          <div aria-hidden="true" className={styles.metrics}>
            {Array.from({ length: METRIC_CARD_COUNT }, (_, index) => (
              <article className={styles.metricCard} key={index}>
                <Skeleton height="1rem" width="58%" />
                <Skeleton height="2.25rem" width="42%" />
                <Skeleton height="0.875rem" width="76%" />
              </article>
            ))}
          </div>

          <div aria-hidden="true" className={styles.contentGrid}>
            {Array.from({ length: CONTENT_SECTION_COUNT }, (_, index) => (
              <section className={styles.contentCard} key={index}>
                <div className={styles.contentHeading}>
                  <Skeleton height="1.375rem" width="11rem" />
                  <Skeleton height="1rem" width="5rem" />
                </div>
                <div className={styles.contentRows}>
                  <Skeleton height="3.5rem" width="100%" />
                  <Skeleton height="3.5rem" width="100%" />
                  <Skeleton height="3.5rem" width="100%" />
                </div>
              </section>
            ))}
          </div>
        </section>
      </div>
    </CatalogVoucherShell>
  );
}
