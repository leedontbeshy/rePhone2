'use client';

import { useRef, useState } from 'react';
import type { PublicMedia } from '@/lib/catalog-api';
import { PublicMediaImage } from '@/components/catalog/public-media';
import styles from './dossier.module.css';

interface ActualUnitGalleryProps {
  readonly inventoryCode: string;
  readonly media: readonly PublicMedia[];
  readonly productName: string;
}

export function ActualUnitGallery({ inventoryCode, media, productName }: ActualUnitGalleryProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const selected = media[selectedIndex];

  const selectRelative = (offset: number) => {
    if (media.length === 0) return;
    setSelectedIndex((current) => (current + offset + media.length) % media.length);
  };

  return (
    <section className={styles.gallery} aria-labelledby="actual-unit-gallery-label">
      <p className={styles.actualUnitBadge} id="actual-unit-gallery-label">
        Ảnh thật · Mã máy {inventoryCode}
      </p>
      <button
        className={styles.mainMediaButton}
        type="button"
        disabled={selected === undefined}
        aria-label={selected === undefined ? 'Chưa có ảnh máy' : 'Mở ảnh máy ở kích thước lớn'}
        onClick={() => dialogRef.current?.showModal()}
      >
        <PublicMediaImage
          className={styles.mainMedia}
          fallbackLabel={`Chưa có ảnh thật của ${productName}, mã máy ${inventoryCode}`}
          media={selected}
          priority
        />
      </button>
      {media.length > 1 ? (
        <div className={styles.thumbnailList} aria-label="Chọn ảnh máy">
          {media.map((item, index) => (
            <button
              aria-current={index === selectedIndex ? 'true' : undefined}
              aria-label={`Xem ảnh ${String(index + 1)} của máy ${inventoryCode}`}
              className={styles.thumbnailButton}
              key={`${item.url}-${String(index)}`}
              type="button"
              onClick={() => {
                setSelectedIndex(index);
              }}
            >
              <PublicMediaImage
                className={styles.thumbnailMedia}
                fallbackLabel={`Ảnh ${String(index + 1)} đang được cập nhật`}
                media={item}
              />
            </button>
          ))}
        </div>
      ) : null}
      <dialog className={styles.galleryDialog} ref={dialogRef} aria-label="Xem ảnh thật của máy">
        <div className={styles.dialogToolbar}>
          <span>
            Ảnh {String(media.length === 0 ? 0 : selectedIndex + 1)}/{String(media.length)}
          </span>
          <button type="button" onClick={() => dialogRef.current?.close()}>
            Đóng
          </button>
        </div>
        <PublicMediaImage
          className={styles.dialogMedia}
          fallbackLabel={`Ảnh máy ${inventoryCode} đang được cập nhật`}
          media={selected}
        />
        {media.length > 1 ? (
          <div className={styles.dialogNavigation}>
            <button
              type="button"
              onClick={() => {
                selectRelative(-1);
              }}
            >
              Ảnh trước
            </button>
            <button
              type="button"
              onClick={() => {
                selectRelative(1);
              }}
            >
              Ảnh sau
            </button>
          </div>
        ) : null}
      </dialog>
    </section>
  );
}
