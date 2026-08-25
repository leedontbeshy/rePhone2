'use client';

import { useEffect, useRef, useState } from 'react';
import { CommerceActions } from '@/app/commerce-actions';
import { Price } from '@/components/ui';
import styles from './dossier.module.css';

interface MobilePurchaseBarProps {
  readonly inventoryCode: string;
  readonly price: string;
  readonly targetId: string;
}

export function MobilePurchaseBar({ inventoryCode, price, targetId }: MobilePurchaseBarProps) {
  const hasSeenTarget = useRef(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const target = document.getElementById(targetId);
    if (target === null) return;

    const observer = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting) {
        hasSeenTarget.current = true;
        setVisible(false);
      } else if (hasSeenTarget.current) {
        setVisible(true);
      }
    });
    observer.observe(target);
    return () => {
      observer.disconnect();
    };
  }, [targetId]);

  if (!visible) return null;

  return (
    <aside className={styles.mobilePurchaseBar} aria-label="Mua máy này">
      <div>
        <span>Giá máy</span>
        <Price amount={price} />
      </div>
      <CommerceActions itemType="IPHONE" inventoryCode={inventoryCode} compact />
    </aside>
  );
}
