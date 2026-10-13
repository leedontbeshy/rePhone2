import Link from 'next/link';
import { STOREFRONT_NAVIGATION } from './storefront-navigation';
import styles from './storefront-footer.module.css';

export function StorefrontFooter() {
  return (
    <div className={styles.footerInner}>
      <div className={styles.brand}>
        <Link className={styles.footerBrand} href="/" prefetch={false}>
          rePhone
        </Link>
        <p>© {new Date().getFullYear()} rePhone. Tất cả quyền được bảo lưu.</p>
      </div>
      <div className={styles.discovery}>
        <nav aria-label="Điều hướng chân trang">
          <ul>
            {STOREFRONT_NAVIGATION.map((item) => (
              <li key={item.href}>
                <Link href={item.href} prefetch={false}>
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <p>Chọn máy bạn thích. Hỗ trợ khi bạn cần.</p>
      </div>
    </div>
  );
}
