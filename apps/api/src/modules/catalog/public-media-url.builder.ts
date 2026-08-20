import { Inject, Injectable } from '@nestjs/common';
import { APP_CONFIG } from '../../config/app-config.module.js';
import type { AppConfig } from '../../config/app-config.js';
import type { PublicMediaDto } from './catalog-response.dto.js';

export interface PublicMediaRecord {
  bucket: string;
  objectPath: string;
  visibility: string;
  altText: string | null;
  width: number | null;
  height: number | null;
  fileSize: number;
}

@Injectable()
export class PublicMediaUrlBuilder {
  public constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  public build(media: PublicMediaRecord, fallbackAltText: string): PublicMediaDto | null {
    if (
      media.visibility !== 'PUBLIC' ||
      media.bucket !== this.config.storage.publicBucket ||
      media.fileSize <= 0 ||
      (media.width !== null && media.width <= 0) ||
      (media.height !== null && media.height <= 0)
    ) {
      return null;
    }
    const encodedPath = encodeObjectPath(media.objectPath);
    if (encodedPath === null) {
      return null;
    }
    const bucket = encodeURIComponent(this.config.storage.publicBucket);
    const baseUrl = this.config.storage.url.replace(/\/$/, '');
    return {
      url: `${baseUrl}/storage/v1/object/public/${bucket}/${encodedPath}`,
      altText: media.altText?.trim() || fallbackAltText,
      ...(media.width === null ? {} : { width: media.width }),
      ...(media.height === null ? {} : { height: media.height }),
    };
  }
}

function encodeObjectPath(objectPath: string): string | null {
  if (
    objectPath.length === 0 ||
    objectPath.startsWith('/') ||
    objectPath.endsWith('/') ||
    objectPath.includes('\\') ||
    hasControlCharacter(objectPath)
  ) {
    return null;
  }
  const segments = objectPath.split('/');
  if (segments.some((segment) => segment.length === 0 || segment === '.' || segment === '..')) {
    return null;
  }
  return segments.map((segment) => encodeURIComponent(segment)).join('/');
}

function hasControlCharacter(value: string): boolean {
  return Array.from(value).some((character) => {
    const codePoint = character.codePointAt(0);
    return codePoint !== undefined && (codePoint <= 0x1f || codePoint === 0x7f);
  });
}
