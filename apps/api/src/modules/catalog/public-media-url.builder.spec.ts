import { describe, expect, it } from 'vitest';
import type { AppConfig } from '../../config/app-config.js';
import { PublicMediaUrlBuilder } from './public-media-url.builder.js';

const config = {
  storage: {
    url: 'https://example.supabase.co',
    publicBucket: 'public-test',
  },
} as AppConfig;

describe('PublicMediaUrlBuilder', () => {
  const builder = new PublicMediaUrlBuilder(config);

  it('builds an encoded public storage URL without exposing storage metadata', () => {
    expect(
      builder.build(
        {
          bucket: 'public-test',
          objectPath: 'catalog/iPhone 13/ảnh chính.jpg',
          visibility: 'PUBLIC',
          altText: null,
          width: 800,
          height: 800,
          fileSize: 1200,
        },
        'iPhone 13',
      ),
    ).toEqual({
      url: 'https://example.supabase.co/storage/v1/object/public/public-test/catalog/iPhone%2013/%E1%BA%A3nh%20ch%C3%ADnh.jpg',
      altText: 'iPhone 13',
      width: 800,
      height: 800,
    });
  });

  it('omits private, cross-bucket, and unsafe paths', () => {
    const base = {
      bucket: 'public-test',
      objectPath: 'catalog/photo.jpg',
      visibility: 'PUBLIC',
      altText: 'Photo',
      width: null,
      height: null,
      fileSize: 100,
    };

    expect(builder.build({ ...base, visibility: 'PRIVATE' }, 'fallback')).toBeNull();
    expect(builder.build({ ...base, bucket: 'private-test' }, 'fallback')).toBeNull();
    expect(builder.build({ ...base, objectPath: '../secret.jpg' }, 'fallback')).toBeNull();
  });
});
