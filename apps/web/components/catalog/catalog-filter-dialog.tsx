'use client';

import type { ReactNode } from 'react';
import { useModalDialogLifecycle } from '@/components/ui/modal-dialog-lifecycle';
import styles from './catalog.module.css';

export function CatalogFilterDialog({ children }: Readonly<{ children: ReactNode }>) {
  const { closeDialog, dialogRef, onDialogClose, openDialog } = useModalDialogLifecycle();

  return (
    <div className={styles.mobileFilterLauncher}>
      <button className={styles.filterButton} type="button" onClick={openDialog}>
        Bộ lọc và sắp xếp
      </button>
      <dialog
        className={styles.filterDialog}
        ref={dialogRef}
        aria-labelledby="catalog-filter-title"
        onClose={onDialogClose}
      >
        <div className={styles.dialogHeader}>
          <h2 id="catalog-filter-title">Lọc sản phẩm</h2>
          <button className={styles.dialogClose} type="button" onClick={closeDialog}>
            Đóng
          </button>
        </div>
        {children}
      </dialog>
    </div>
  );
}
