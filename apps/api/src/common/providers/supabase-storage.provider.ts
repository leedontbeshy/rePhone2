import { Inject, Injectable } from '@nestjs/common';
import { createClient } from '@supabase/supabase-js';
import { APP_CONFIG } from '../../config/app-config.module.js';
import type { AppConfig } from '../../config/app-config.js';
import type { StorageProvider, StoredObject, UploadObjectInput } from './storage-provider.js';

export class StorageProviderError extends Error {
  public constructor(operation: string) {
    super(`Storage provider failed during ${operation}`);
    this.name = 'StorageProviderError';
  }
}

@Injectable()
export class SupabaseStorageProvider implements StorageProvider {
  private readonly client: ReturnType<typeof createClient>;

  public constructor(@Inject(APP_CONFIG) config: AppConfig) {
    this.client = createClient(config.storage.url, config.storage.serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
  }

  public async probe(): Promise<void> {
    const { error } = await this.client.storage.listBuckets();
    if (error !== null) throw new StorageProviderError('probe');
  }

  public async upload(input: UploadObjectInput): Promise<StoredObject> {
    const { error } = await this.client.storage
      .from(input.bucket)
      .upload(input.objectPath, input.bytes, {
        contentType: input.mimeType,
        upsert: false,
      });
    if (error !== null) throw new StorageProviderError('upload');
    return {
      bucket: input.bucket,
      objectPath: input.objectPath,
      mimeType: input.mimeType,
      fileSize: input.bytes.byteLength,
    };
  }

  public async delete(bucket: string, objectPath: string): Promise<void> {
    const { error } = await this.client.storage.from(bucket).remove([objectPath]);
    if (error !== null) throw new StorageProviderError('delete');
  }

  public async createSignedReadUrl(
    bucket: string,
    objectPath: string,
    ttlSeconds: number,
    options?: { download?: boolean | string },
  ): Promise<string> {
    const { data, error } = await this.client.storage
      .from(bucket)
      .createSignedUrl(objectPath, ttlSeconds, options);
    if (error !== null) throw new StorageProviderError('signed-read-url');
    return data.signedUrl;
  }
}
