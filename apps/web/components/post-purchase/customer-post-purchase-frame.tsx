import type { ReactNode } from 'react';
import { PostPurchaseNavigation } from './post-purchase-navigation';
import styles from './post-purchase-frame.module.css';

export function CustomerPostPurchaseFrame({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div className={styles.frame}>
      <PostPurchaseNavigation />
      <div className={styles.content}>{children}</div>
    </div>
  );
}
