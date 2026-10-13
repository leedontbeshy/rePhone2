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
    title: 'Xem kỹ rồi hãy chọn',
    description: 'Pin, ngoại hình và chức năng đều có trong hồ sơ máy.',
  },
  {
    icon: <TagIcon aria-hidden="true" size={28} weight="regular" />,
    title: 'Vừa nhu cầu, vừa túi tiền',
    description: 'So sánh những máy đang có để chọn chiếc hợp với bạn.',
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
