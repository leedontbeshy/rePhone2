'use client';

import { ImageSquareIcon } from '@phosphor-icons/react';
import { useEffect, useRef, useState } from 'react';
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
  const imageRef = useRef<HTMLImageElement>(null);
  const mediaClassName = classNames(styles.media, className);

  useEffect(() => {
    if (media === undefined || loadedUrl === media.url || failedUrl === media.url) return;
    // An SSR image may finish loading before hydration attaches onLoad.
    if (imageRef.current?.complete && imageRef.current.naturalWidth > 0) return;
    const image = imageRef.current;
    if (image === null) return;
    let timeout: number | undefined;
    const startTimeout = () => {
      if (timeout !== undefined || (image.complete && image.naturalWidth > 0)) return;
      timeout = window.setTimeout(() => {
        if (!image.complete || image.naturalWidth === 0) setFailedUrl(media.url);
      }, MEDIA_LOAD_TIMEOUT_MS);
    };
    // Native lazy loading may defer a distant image indefinitely. Its load budget
    // starts only when it approaches the viewport, rather than at page hydration.
    let observer: IntersectionObserver | undefined;
    if (priority || typeof IntersectionObserver === 'undefined') {
      startTimeout();
    } else {
      observer = new IntersectionObserver(
        (entries) => {
          if (!entries.some((entry) => entry.isIntersecting)) return;
          observer?.disconnect();
          startTimeout();
        },
        { rootMargin: '300px' },
      );
      observer.observe(image);
    }
    return () => {
      if (timeout !== undefined) window.clearTimeout(timeout);
      observer?.disconnect();
    };
  }, [failedUrl, loadedUrl, media, priority]);

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
      ref={imageRef}
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
