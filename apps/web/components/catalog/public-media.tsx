'use client';

import { ImageSquareIcon } from '@phosphor-icons/react';
import { useState } from 'react';
import type { PublicMedia } from '@/lib/catalog-api';
import { classNames } from '@/components/ui/class-names';
import styles from './public-media.module.css';

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
  const mediaClassName = classNames(styles.media, className);

  if (media === undefined || failedUrl === media.url) {
    return (
      <div
        className={classNames(mediaClassName, styles.mediaFallback)}
        role="img"
        aria-label={fallbackLabel}
      >
        <ImageSquareIcon aria-hidden="true" size={32} weight="regular" />
        <span>Ảnh đang được cập nhật</span>
      </div>
    );
  }

  return (
    <img
      alt={media.altText}
      className={mediaClassName}
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
