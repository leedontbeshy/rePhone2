import {
  EnvelopeSimpleIcon,
  FacebookLogoIcon,
  InstagramLogoIcon,
  MapPinIcon,
  PhoneIcon,
  TiktokLogoIcon,
} from '@phosphor-icons/react/ssr';
import Link from 'next/link';
import { toMapSearchHref, toPhoneHref } from '@/lib/contact-links';
import type {
  StorefrontFooterConfig,
  StorefrontSocialPlatform,
} from '@/lib/storefront-footer-config';
import styles from './storefront-footer.module.css';

export interface StorefrontFooterStore {
  readonly storeAddress: string;
  readonly storeName: string;
  readonly storePhone: string;
}

interface StorefrontFooterProps {
  readonly config: StorefrontFooterConfig;
  readonly store: StorefrontFooterStore | null;
}

const IPHONE_GENERATIONS = ['17', '16', '15', '14', '13', '12', '11', 'X'] as const;

const DISCOVERY_LINKS = [
  { href: '/products?productType=IPHONE&inStock=true', label: 'Máy đang bán' },
  { href: '/products?productType=ACCESSORY&inStock=true', label: 'Phụ kiện' },
  { href: '/vouchers', label: 'Voucher' },
  { href: '/store', label: 'Cửa hàng' },
] as const;

const SOCIAL_ICONS = {
  FACEBOOK: FacebookLogoIcon,
  INSTAGRAM: InstagramLogoIcon,
  TIKTOK: TiktokLogoIcon,
} satisfies Record<StorefrontSocialPlatform, typeof FacebookLogoIcon>;

export function StorefrontFooter({ config, store }: Readonly<StorefrontFooterProps>) {
  const phoneHref = store === null ? null : toPhoneHref(store.storePhone);
  const mapHref = store === null ? null : toMapSearchHref(store.storeAddress);

  return (
    <div className={styles.footerInner}>
      <div className={styles.footerGrid}>
        <div className={styles.brandColumn}>
          <Link className={styles.footerBrand} href="/">
            rePhone
          </Link>
          <p className={styles.brandDescription}>
            Ảnh thật, tình trạng và giá bán được trình bày rõ cho từng máy.
          </p>
          {config.socialLinks.length === 0 ? null : (
            <ul className={styles.socialList} aria-label="rePhone trên mạng xã hội">
              {config.socialLinks.map((social) => {
                const Icon = SOCIAL_ICONS[social.platform];
                return (
                  <li key={social.platform}>
                    <a
                      className={styles.socialLink}
                      href={social.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`Theo dõi rePhone trên ${social.label}`}
                    >
                      <Icon aria-hidden="true" size={20} weight="regular" />
                    </a>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <nav className={styles.navigationGroup} aria-labelledby="footer-iphone-heading">
          <h2 className={styles.sectionTitle} id="footer-iphone-heading">
            Dòng iPhone
          </h2>
          <ul className={styles.generationList}>
            {IPHONE_GENERATIONS.map((generation) => {
              const label = `iPhone ${generation}`;
              const query = new URLSearchParams({ productType: 'IPHONE', q: label }).toString();
              return (
                <li key={generation}>
                  <Link href={`/products?${query}`} prefetch={false}>
                    {label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <nav className={styles.navigationGroup} aria-labelledby="footer-discovery-heading">
          <h2 className={styles.sectionTitle} id="footer-discovery-heading">
            Khám phá
          </h2>
          <ul className={styles.linkList}>
            {DISCOVERY_LINKS.map((link) => (
              <li key={link.href}>
                <Link href={link.href}>{link.label}</Link>
              </li>
            ))}
          </ul>
        </nav>

        <section className={styles.contactColumn} aria-labelledby="footer-contact-heading">
          <h2 className={styles.sectionTitle} id="footer-contact-heading">
            Liên hệ
          </h2>
          {store === null ? null : <p className={styles.storeName}>{store.storeName}</p>}
          <address className={styles.contactList}>
            {phoneHref === null || store === null ? null : (
              <a href={phoneHref}>
                <PhoneIcon aria-hidden="true" size={19} weight="regular" />
                <span>{store.storePhone}</span>
              </a>
            )}
            {config.email === null ? null : (
              <a href={`mailto:${config.email}`}>
                <EnvelopeSimpleIcon aria-hidden="true" size={19} weight="regular" />
                <span>{config.email}</span>
              </a>
            )}
            {mapHref === null || store === null ? (
              <Link href="/store">
                <MapPinIcon aria-hidden="true" size={19} weight="regular" />
                <span>Xem địa chỉ cửa hàng</span>
              </Link>
            ) : (
              <a href={mapHref} target="_blank" rel="noopener noreferrer">
                <MapPinIcon aria-hidden="true" size={19} weight="regular" />
                <span>{store.storeAddress}</span>
              </a>
            )}
          </address>
        </section>
      </div>

      <div className={styles.bottomBar}>
        <p>© {new Date().getFullYear()} rePhone</p>
        <p>Thông tin sản phẩm được cập nhật theo từng máy đang bán.</p>
      </div>
    </div>
  );
}
