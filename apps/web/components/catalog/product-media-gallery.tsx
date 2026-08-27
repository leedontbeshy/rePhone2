'use client';

import { CaretLeftIcon, CaretRightIcon, XIcon } from '@phosphor-icons/react';
import { useRef, useState } from 'react';
import type { PublicMedia } from '@/lib/catalog-api';
import { classNames } from '@/components/ui/class-names';
import { PublicMediaImage } from './public-media';
import styles from './product-media-gallery.module.css';

interface ProductMediaGalleryProps {
  readonly fallbackLabel: string;
  readonly label: string;
  readonly media: readonly PublicMedia[];
  readonly priority?: boolean;
}

export function ProductMediaGallery({
  fallbackLabel,
  label,
  media,
  priority = false,
}: ProductMediaGalleryProps) {
  const mediaIdentity = media.map(({ url }) => url).join('\u0000');
  const [selection, setSelection] = useState({ identity: mediaIdentity, index: 0 });
  const dialogRef = useRef<HTMLDialogElement>(null);
  const selectedIndex = selection.identity === mediaIdentity ? selection.index : 0;
  const activeIndex = Math.min(selectedIndex, Math.max(0, media.length - 1));
  const selected = media[activeIndex];
  const hasMultipleImages = media.length > 1;

  const selectRelative = (offset: number) => {
    if (!hasMultipleImages) return;
    setSelection({
      identity: mediaIdentity,
      index: (activeIndex + offset + media.length) % media.length,
    });
  };

  return (
    <section className={styles.gallery} aria-label={label}>
      <p className={styles.galleryLabel}>{label}</p>
      <div className={classNames(styles.galleryFrame, !hasMultipleImages && styles.singleImage)}>
        {hasMultipleImages ? (
          <div className={styles.thumbnailList} aria-label="Chọn ảnh sản phẩm">
            {media.map((item, index) => (
              <button
                aria-current={index === activeIndex ? 'true' : undefined}
                aria-label={`Xem ảnh ${String(index + 1)} trong ${String(media.length)} ảnh`}
                className={styles.thumbnailButton}
                key={`${item.url}-${String(index)}`}
                type="button"
                onClick={() => {
                  setSelection({ identity: mediaIdentity, index });
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

        <div className={styles.stage}>
          <button
            className={styles.mainMediaButton}
            type="button"
            disabled={selected === undefined}
            aria-label={selected === undefined ? fallbackLabel : 'Mở ảnh ở kích thước lớn'}
            onClick={() => dialogRef.current?.showModal()}
          >
            <PublicMediaImage
              className={styles.mainMedia}
              fallbackLabel={fallbackLabel}
              media={selected}
              priority={priority}
            />
          </button>

          {hasMultipleImages ? (
            <>
              <button
                aria-label="Ảnh trước"
                className={classNames(styles.galleryArrow, styles.previousArrow)}
                type="button"
                onClick={() => {
                  selectRelative(-1);
                }}
              >
                <CaretLeftIcon aria-hidden="true" size={22} weight="bold" />
              </button>
              <button
                aria-label="Ảnh sau"
                className={classNames(styles.galleryArrow, styles.nextArrow)}
                type="button"
                onClick={() => {
                  selectRelative(1);
                }}
              >
                <CaretRightIcon aria-hidden="true" size={22} weight="bold" />
              </button>
              <div className={styles.paginationDots} aria-hidden="true">
                {media.map((item, index) => (
                  <span
                    className={index === activeIndex ? styles.activeDot : undefined}
                    key={`${item.url}-dot-${String(index)}`}
                  />
                ))}
              </div>
            </>
          ) : null}
        </div>
      </div>

      <dialog className={styles.galleryDialog} ref={dialogRef} aria-label={label}>
        <div className={styles.dialogToolbar}>
          <span>
            Ảnh {String(media.length === 0 ? 0 : activeIndex + 1)}/{String(media.length)}
          </span>
          <button
            aria-label="Đóng ảnh phóng lớn"
            className={styles.dialogClose}
            type="button"
            onClick={() => dialogRef.current?.close()}
          >
            <XIcon aria-hidden="true" size={20} />
          </button>
        </div>
        <PublicMediaImage
          className={styles.dialogMedia}
          fallbackLabel={fallbackLabel}
          media={selected}
        />
        {hasMultipleImages ? (
          <div className={styles.dialogNavigation}>
            <button
              type="button"
              onClick={() => {
                selectRelative(-1);
              }}
            >
              <CaretLeftIcon aria-hidden="true" size={18} />
              Ảnh trước
            </button>
            <button
              type="button"
              onClick={() => {
                selectRelative(1);
              }}
            >
              Ảnh sau
              <CaretRightIcon aria-hidden="true" size={18} />
            </button>
          </div>
        ) : null}
      </dialog>
    </section>
  );
}
