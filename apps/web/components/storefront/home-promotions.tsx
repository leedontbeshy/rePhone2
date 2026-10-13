import Link from 'next/link';
import { PublicMediaImage } from '@/components/catalog/public-media';
import styles from './home-promotions.module.css';

export function HomePromotions({ side }: Readonly<{ side: 'left' | 'right' }>) {
  return (
    <aside
      className={styles.rail}
      data-side={side}
      aria-label={side === 'left' ? 'Ưu đãi tại rePhone' : 'Ghé cửa hàng rePhone'}
    >
      <Link href={side === 'left' ? '/vouchers' : '/store'} className={styles.banner}>
        <span className={styles.kicker}>rePhone</span>
        <strong>
          {side === 'left' ? 'Thêm ưu đãi. Nhẹ chi phí.' : 'Thích máy nào, xem tận tay.'}
        </strong>
        <PublicMediaImage
          className={styles.art}
          fallbackLabel="Ảnh minh họa rePhone"
          media={{
            url: `/ui-studio/promotion-${side === 'left' ? 'vouchers' : 'store'}.webp`,
            width: 480,
            height: 720,
            altText: '',
          }}
        />
        <p>
          {side === 'left'
            ? 'Xem mã giảm giá đang có trước khi đặt máy.'
            : 'Ghé cửa hàng để xem máy và chọn chiếc vừa ý.'}
        </p>
        <span className={styles.action}>{side === 'left' ? 'Xem ưu đãi' : 'Đến cửa hàng'} →</span>
      </Link>
    </aside>
  );
}
