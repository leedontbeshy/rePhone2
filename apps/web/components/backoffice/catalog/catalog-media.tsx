'use client';

import { ImageSquareIcon } from '@phosphor-icons/react';
import { useState } from 'react';
import styles from './catalog.module.css';

export interface CatalogMediaSource {
  readonly altText?: string | null;
  readonly url: string;
}

interface CatalogMediaImageProps {
  readonly className?: string | undefined;
  readonly fallbackLabel: string;
  readonly media?: CatalogMediaSource | null;
  readonly priority?: boolean;
}

export function CatalogMediaImage({
  className,
  fallbackLabel,
  media,
  priority = false,
}: CatalogMediaImageProps) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);

  if (media === null || media === undefined || failedUrl === media.url) {
    return (
      <div
        aria-label={fallbackLabel}
        className={[className, styles.mediaFallback].filter(Boolean).join(' ')}
        role="img"
      >
        <ImageSquareIcon aria-hidden="true" size={30} weight="regular" />
      </div>
    );
  }

  return (
    // Product media URLs are provided by the catalog API and may use the configured CDN host.
    <img
      alt={media.altText?.trim() || fallbackLabel}
      className={className}
      fetchPriority={priority ? 'high' : 'auto'}
      loading={priority ? 'eager' : 'lazy'}
      src={media.url}
      onError={() => {
        setFailedUrl(media.url);
      }}
    />
  );
}
