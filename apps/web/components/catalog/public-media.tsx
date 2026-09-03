'use client';

import { ImageSquareIcon } from '@phosphor-icons/react';
import { useEffect, useState } from 'react';
import type { PublicMedia } from '@/lib/catalog-api';
import { classNames } from '@/components/ui/class-names';
import styles from './public-media.module.css';

interface PublicMediaProps {
  readonly className?: string | undefined;
  readonly fallbackLabel: string;
  readonly media?: PublicMedia | undefined;
  readonly priority?: boolean;
}

const MEDIA_LOAD_TIMEOUT_MS = 4_000;

export function PublicMediaImage({
  className,
  fallbackLabel,
  media,
  priority = false,
}: PublicMediaProps) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null);
  const mediaClassName = classNames(styles.media, className);

  useEffect(() => {
    if (media === undefined || loadedUrl === media.url || failedUrl === media.url) return;
    const timeout = window.setTimeout(() => {
      setFailedUrl(media.url);
    }, MEDIA_LOAD_TIMEOUT_MS);
    return () => {
      window.clearTimeout(timeout);
    };
  }, [failedUrl, loadedUrl, media]);

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
      onLoad={() => {
        setLoadedUrl(media.url);
      }}
      onError={() => {
        setFailedUrl(media.url);
      }}
    />
  );
}
