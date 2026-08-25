'use client';

import type { ReactNode } from 'react';
import { useRef } from 'react';
import styles from './catalog.module.css';

export function CatalogFilterDialog({ children }: Readonly<{ children: ReactNode }>) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  return (
    <div className={styles.mobileFilterLauncher}>
      <button
        className={styles.filterButton}
        type="button"
        onClick={() => dialogRef.current?.showModal()}
      >
        Bộ lọc và sắp xếp
      </button>
      <dialog
        className={styles.filterDialog}
        ref={dialogRef}
        aria-labelledby="catalog-filter-title"
      >
        <div className={styles.dialogHeader}>
          <h2 id="catalog-filter-title">Lọc sản phẩm</h2>
          <button
            className={styles.dialogClose}
            type="button"
            onClick={() => dialogRef.current?.close()}
          >
            Đóng
          </button>
        </div>
        {children}
      </dialog>
    </div>
  );
}
