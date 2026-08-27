'use client';

import { useEffect, useRef, useState } from 'react';
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
  const hasSeenTarget = useRef(false);
  const targetVisible = useRef(true);
  const footerVisible = useRef(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const target = document.getElementById(targetId);
    if (target === null) return;
    const footer = document.querySelector('footer');

    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.target === target) {
          targetVisible.current = entry.isIntersecting;
          if (entry.isIntersecting) hasSeenTarget.current = true;
        } else if (entry.target === footer) {
          footerVisible.current = entry.isIntersecting;
        }
      }

      setVisible(hasSeenTarget.current && !targetVisible.current && !footerVisible.current);
    });
    observer.observe(target);
    if (footer !== null) observer.observe(footer);
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
      <CommerceActions
        itemType="IPHONE"
        inventoryCode={inventoryCode}
        available={available}
        compact
      />
    </aside>
  );
}
