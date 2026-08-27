import { MagnifyingGlassIcon } from '@phosphor-icons/react/ssr';
import { StorefrontSessionActions } from './storefront-session-actions';
import styles from './storefront-header-actions.module.css';

export function StorefrontHeaderActions() {
  return (
    <div className={styles.actions}>
      <form className={styles.search} action="/products" method="get" role="search">
        <label className={styles.visuallyHidden} htmlFor="desktop-storefront-search">
          Tìm iPhone hoặc phụ kiện
        </label>
        <input
          id="desktop-storefront-search"
          name="q"
          type="search"
          maxLength={100}
          placeholder="Tìm iPhone hoặc phụ kiện"
        />
        <button type="submit" aria-label="Tìm kiếm">
          <MagnifyingGlassIcon aria-hidden="true" size={20} weight="bold" />
        </button>
      </form>
      <StorefrontSessionActions />
    </div>
  );
}
