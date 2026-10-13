'use client';

import { useEffect, useState } from 'react';
import { CommerceActions } from '@/app/commerce-actions';
import { Price } from '@/components/ui';
import styles from './dossier.module.css';

interface MobilePurchaseBarProps {
  readonly available: boolean;
  readonly inventoryCode: string;
  readonly price: string;
  readonly targetId: string;
}

export function MobilePurchaseBar({
  available,
  inventoryCode,
  price,
  targetId,
}: MobilePurchaseBarProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const target = document.getElementById(targetId);
    if (target === null) return;
    const footer = document.querySelector('footer');

    let frame = 0;
    const updateVisibility = () => {
      frame = 0;
      const footerBounds = footer?.getBoundingClientRect();
      const footerVisible =
        footerBounds !== undefined &&
        footerBounds.top < window.innerHeight &&
        footerBounds.bottom > 0;
      setVisible(target.getBoundingClientRect().bottom <= 0 && !footerVisible);
    };
    const scheduleUpdate = () => {
      if (frame === 0) frame = window.requestAnimationFrame(updateVisibility);
    };

    // A jump can move the target from above to below the viewport without an
    // intersection transition. Read its current position on scroll as well.
    const observer = new IntersectionObserver(scheduleUpdate);
    observer.observe(target);
    if (footer !== null) observer.observe(footer);
    window.addEventListener('scroll', scheduleUpdate, { passive: true });
    window.addEventListener('resize', scheduleUpdate);
    scheduleUpdate();
    return () => {
      observer.disconnect();
      window.removeEventListener('scroll', scheduleUpdate);
      window.removeEventListener('resize', scheduleUpdate);
      window.cancelAnimationFrame(frame);
    };
  }, [targetId]);

  if (!visible) return null;

  return (
    <aside className={styles.mobilePurchaseBar} aria-label="Mua máy này">
      <div>
        <span>Giá máy</span>
        <Price amount={price} />
      </div>
      <CommerceActions
        itemType="IPHONE"
        inventoryCode={inventoryCode}
        available={available}
        compact
      />
    </aside>
  );
}
