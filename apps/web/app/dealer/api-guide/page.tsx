import { StorefrontFrame } from '@/components/storefront/storefront-frame';
import styles from '@/components/partners/partner.module.css';
import { DealerApiGuide } from '@/components/dealer/dealer-api-guide';

export default function Page() {
  const current = process.env.API_PUBLIC_URL
    ? `${process.env.API_PUBLIC_URL.replace(/\/$/, '')}/api/v1`
    : (process.env.NEXT_PUBLIC_API_BASE_URL ?? '/api/v1');
  return (
    <StorefrontFrame>
      <div className={styles.page}>
        <DealerApiGuide
          liveApiUrl={process.env.DEALER_ENVIRONMENT === 'TEST' ? '' : current}
          sandboxApiUrl={process.env.DEALER_SANDBOX_API_URL ?? ''}
          sandboxWebUrl={process.env.DEALER_SANDBOX_WEB_URL ?? ''}
        />
      </div>
    </StorefrontFrame>
  );
}
