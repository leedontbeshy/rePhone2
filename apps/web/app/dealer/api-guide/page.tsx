import { StorefrontFrame } from '@/components/storefront/storefront-frame';
import styles from '@/components/partners/partner.module.css';
import { DealerApiGuide } from '@/components/dealer/dealer-api-guide';
import { dealerApiGuideConfiguration } from '@/lib/dealer-api-guide-config';

export default function Page() {
  const configuration = dealerApiGuideConfiguration({
    apiPublicUrl: process.env.API_PUBLIC_URL,
    publicApiBaseUrl: process.env.NEXT_PUBLIC_API_BASE_URL,
    dealerEnvironment: process.env.DEALER_ENVIRONMENT,
    sandboxApiUrl: process.env.DEALER_SANDBOX_API_URL,
    sandboxWebUrl: process.env.DEALER_SANDBOX_WEB_URL,
  });
  return (
    <StorefrontFrame>
      <div className={styles.page}>
        <DealerApiGuide {...configuration} />
      </div>
    </StorefrontFrame>
  );
}
