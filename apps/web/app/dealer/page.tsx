import { DealerPortal } from '@/components/dealer/dealer-portal';
import { StorefrontFrame } from '@/components/storefront/storefront-frame';
import styles from '@/components/partners/partner.module.css';
export const metadata = { title: 'Cổng đại lý | rePhone', robots: { index: false, follow: false } };
export default function DealerPage() {
  return (
    <StorefrontFrame>
      <div className={styles.page}>
        <DealerPortal />
      </div>
    </StorefrontFrame>
  );
}
