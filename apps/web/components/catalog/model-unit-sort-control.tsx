'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { ChangeEvent } from 'react';
import type { ModelUnitOfferSort } from '@/lib/model-unit-offers';
import styles from './iphone-model-detail.module.css';

interface ModelUnitSortControlProps {
  readonly value: ModelUnitOfferSort;
}

export function ModelUnitSortControl({ value }: ModelUnitSortControlProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  const updateSort = (event: ChangeEvent<HTMLSelectElement>) => {
    const next = new URLSearchParams(searchParams.toString());
    const selection = event.target.value;
    if (selection === 'PRICE_ASC') next.delete('unitSort');
    else next.set('unitSort', selection);
    const query = next.toString();
    router.push(query.length === 0 ? pathname : `${pathname}?${query}`, { scroll: false });
  };

  return (
    <label className={styles.sortControl}>
      <span>Sắp xếp máy</span>
      <select name="unitSort" value={value} onChange={updateSort}>
        <option value="PRICE_ASC">Giá thấp nhất</option>
        <option value="PRICE_DESC">Giá cao nhất</option>
        <option value="BATTERY_DESC">Pin cao nhất</option>
      </select>
    </label>
  );
}
