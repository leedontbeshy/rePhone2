'use client';

import { useState } from 'react';
import type { PublicMedia } from '@/lib/catalog-api';
import styles from './home.module.css';

interface HomeMediaProps {
  readonly media?: PublicMedia | undefined;
  readonly productName: string;
}

export function HomeMedia({ media, productName }: Readonly<HomeMediaProps>) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);

  if (media === undefined || failedUrl === media.url) {
    return (
      <div
        className={styles.mediaFallback}
        role="img"
        aria-label={`Chưa có ảnh đại diện cho ${productName}`}
      >
        <span>Ảnh dòng máy chưa khả dụng</span>
      </div>
    );
  }

  return (
    <div className={styles.mediaFrame}>
      <img
        src={media.url}
        alt={media.altText}
        width={media.width ?? 800}
        height={media.height ?? 800}
        loading="lazy"
        decoding="async"
        onError={() => {
          setFailedUrl(media.url);
        }}
      />
      <span>Ảnh dòng máy</span>
    </div>
  );
}
