import { AffiliatePortal } from '@/components/affiliate/affiliate-portal';
import { StorefrontFrame } from '@/components/storefront/storefront-frame';
import styles from '@/components/partners/partner.module.css';
export const metadata = {
  title: 'Cộng tác viên | rePhone',
  robots: { index: false, follow: false },
};
export default function Page() {
  return (
    <StorefrontFrame>
      <div className={styles.page}>
        <AffiliatePortal />
      </div>
    </StorefrontFrame>
  );
}
