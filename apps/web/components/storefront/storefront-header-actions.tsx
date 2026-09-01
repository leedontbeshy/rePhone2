import { StorefrontSessionActions } from './storefront-session-actions';
import { StorefrontSearch } from './storefront-search';
import styles from './storefront-header-actions.module.css';

export function StorefrontHeaderActions() {
  return (
    <div className={styles.actions}>
      <StorefrontSearch id="desktop-storefront-search" variant="desktop" />
      <StorefrontSessionActions />
    </div>
  );
}
