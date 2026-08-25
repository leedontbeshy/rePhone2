import type { ReactNode } from 'react';
import { DEFAULT_MAIN_ID, MainLandmark, SkipLink, Wordmark } from './shell-parts';
import { joinClassNames } from './shell-utils';
import type { SharedShellProps } from './shell.types';
import styles from './shells.module.css';

interface AuthShellProps extends SharedShellProps {
  readonly title: string;
  readonly description?: ReactNode;
  readonly footer?: ReactNode;
}

export function AuthShell({
  children,
  brand,
  title,
  description,
  footer,
  mainId = DEFAULT_MAIN_ID,
  mainClassName,
}: Readonly<AuthShellProps>) {
  return (
    <div className={styles.authShell} data-shell="auth">
      <SkipLink targetId={mainId} />
      <header className={styles.authHeader}>
        <Wordmark brand={brand} />
      </header>
      <MainLandmark id={mainId} className={joinClassNames(styles.authMain, mainClassName)}>
        <section className={styles.authPanel} aria-labelledby={`${mainId}-title`}>
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
