import {
  EnvelopeSimpleIcon,
  FacebookLogoIcon,
  InstagramLogoIcon,
  TiktokLogoIcon,
} from '@phosphor-icons/react/ssr';
import type {
  StorefrontFooterConfig,
  StorefrontSocialPlatform,
} from '@/lib/storefront-footer-config';
import styles from './store-summary.module.css';

const SOCIAL_ICONS = {
  FACEBOOK: FacebookLogoIcon,
  INSTAGRAM: InstagramLogoIcon,
  TIKTOK: TiktokLogoIcon,
} satisfies Record<StorefrontSocialPlatform, typeof FacebookLogoIcon>;

export function StoreContactChannels({ config }: Readonly<{ config: StorefrontFooterConfig }>) {
  if (config.email === null && config.socialLinks.length === 0) return null;

  return (
    <section className={styles.channels} aria-labelledby="store-contact-channels-title">
      <div className={styles.heading}>
        <h2 id="store-contact-channels-title">Kết nối với rePhone</h2>
        <p>
          {config.email === null
            ? 'Theo dõi và liên hệ qua các trang mạng xã hội của cửa hàng.'
            : config.socialLinks.length === 0
              ? 'Bạn có thể liên hệ cửa hàng qua email.'
              : 'Bạn có thể liên hệ qua email hoặc các trang mạng xã hội của cửa hàng.'}
        </p>
      </div>
      <div className={styles.channelLinks}>
        {config.email === null ? null : (
          <a className={styles.channelLink} href={`mailto:${config.email}`}>
            <EnvelopeSimpleIcon aria-hidden="true" size={22} />
            <span>{config.email}</span>
          </a>
        )}
        {config.socialLinks.map((social) => {
          const Icon = SOCIAL_ICONS[social.platform];
          return (
            <a
              className={styles.channelLink}
              href={social.href}
              key={social.platform}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Icon aria-hidden="true" size={22} />
              <span>{social.label}</span>
            </a>
          );
        })}
      </div>
    </section>
  );
}
