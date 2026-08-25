'use client';

import { useState } from 'react';
import type { PublicMedia } from '@/lib/catalog-api';
import styles from './catalog.module.css';

interface PublicMediaProps {
  readonly className?: string | undefined;
  readonly fallbackLabel: string;
  readonly media?: PublicMedia | undefined;
  readonly priority?: boolean;
}

export function PublicMediaImage({
  className,
  fallbackLabel,
  media,
  priority = false,
}: PublicMediaProps) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const classNames = [styles.media, className]
    .filter((value): value is string => value !== undefined)
    .join(' ');

  if (media === undefined || failedUrl === media.url) {
    return (
      <div
        className={[classNames, styles.mediaFallback]
          .filter((value): value is string => value !== undefined)
          .join(' ')}
        role="img"
        aria-label={fallbackLabel}
      >
        <span>Ảnh đang được cập nhật</span>
      </div>
    );
  }

  return (
    <img
      alt={media.altText}
      className={classNames}
      fetchPriority={priority ? 'high' : 'auto'}
      height={media.height ?? 800}
      loading={priority ? 'eager' : 'lazy'}
      src={media.url}
      width={media.width ?? 800}
      onError={() => {
        setFailedUrl(media.url);
      }}
    />
  );
}
