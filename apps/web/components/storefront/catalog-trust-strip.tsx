import { CameraIcon, ShieldCheckIcon, TagIcon } from '@phosphor-icons/react/ssr';
import type { ReactNode } from 'react';
import styles from './catalog-trust-strip.module.css';

const ITEMS: readonly { icon: ReactNode; title: string; description: string }[] = [
  {
    icon: <CameraIcon aria-hidden="true" size={28} weight="regular" />,
    title: 'Ảnh thật từng máy',
    description: 'Xem ảnh của đúng chiếc máy trước khi chọn.',
  },
  {
    icon: <ShieldCheckIcon aria-hidden="true" size={28} weight="regular" />,
    title: 'Kiểm định rõ ràng',
    description: 'Kết quả kiểm tra được trình bày theo từng máy.',
  },
  {
    icon: <TagIcon aria-hidden="true" size={28} weight="regular" />,
    title: 'Giá theo máy đang bán',
    description: 'Giá model lấy từ chiếc máy khả dụng thấp nhất.',
  },
];

export function CatalogTrustStrip() {
  return (
    <section className={styles.strip} aria-label="Thông tin giúp bạn chọn iPhone">
      {ITEMS.map((item) => (
        <div className={styles.item} key={item.title}>
          <span className={styles.icon}>{item.icon}</span>
          <div>
            <h2>{item.title}</h2>
            <p>{item.description}</p>
          </div>
        </div>
      ))}
    </section>
  );
}
