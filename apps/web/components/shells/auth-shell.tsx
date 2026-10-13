import type { ReactNode } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { HouseIcon } from '@phosphor-icons/react/ssr';
import { DEFAULT_MAIN_ID, MainLandmark, SkipLink, Wordmark } from './shell-parts';
import { joinClassNames } from './shell-utils';
import type { SharedShellProps } from './shell.types';
import styles from './shells.module.css';

interface AuthShellProps extends SharedShellProps {
  readonly title: string;
  readonly description?: ReactNode;
  readonly footer?: ReactNode;
  readonly navigation?: ReactNode;
}

export function AuthShell({
  children,
  brand,
  title,
  description,
  footer,
  navigation,
  mainId = DEFAULT_MAIN_ID,
  mainClassName,
}: Readonly<AuthShellProps>) {
  return (
    <div className={joinClassNames('rp-surface', styles.authShell)} data-shell="auth">
      <SkipLink targetId={mainId} />
      <div className={styles.authArtwork} aria-hidden="true">
        <Image src="/ui-studio/auth-studio.webp" alt="" fill sizes="100vw" />
        <div className={styles.authAside}>
          <p>
            Máy bạn chọn.
            <br />
            Đồng hành dài lâu.
          </p>
          <span>Theo dõi đơn hàng · Xem bảo hành · Lưu địa chỉ</span>
        </div>
      </div>
      <header className={styles.authHeader}>
        <Wordmark brand={brand} />
        <Link className={styles.authHomeLink} href="/" prefetch={false}>
          <HouseIcon aria-hidden="true" size={20} />
          Về trang chủ
        </Link>
      </header>
      <MainLandmark id={mainId} className={joinClassNames(styles.authMain, mainClassName)}>
        <section className={styles.authPanel} aria-labelledby={`${mainId}-title`}>
          {navigation}
          <div className={styles.authIntroduction}>
            <h1 id={`${mainId}-title`} className={styles.authTitle}>
              {title}
            </h1>
            {description === undefined ? null : (
              <div className={styles.authDescription}>{description}</div>
            )}
          </div>
          {children}
        </section>
      </MainLandmark>
      {footer === undefined ? null : <footer className={styles.authFooter}>{footer}</footer>}
    </div>
  );
}
