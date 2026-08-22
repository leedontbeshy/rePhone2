import { Injectable } from '@nestjs/common';
import type { StorageProvider, StoredObject, UploadObjectInput } from './storage-provider.js';

@Injectable()
export class InMemoryStorageProvider implements StorageProvider {
  private readonly objects = new Map<string, StoredObject>();

  public upload(input: UploadObjectInput): Promise<StoredObject> {
    const key = `${input.bucket}/${input.objectPath}`;
    if (this.objects.has(key)) return Promise.reject(new Error('Object already exists'));
    const stored = {
      bucket: input.bucket,
      objectPath: input.objectPath,
      mimeType: input.mimeType,
      fileSize: input.bytes.byteLength,
    };
    this.objects.set(key, stored);
    return Promise.resolve(stored);
  }

  public delete(bucket: string, objectPath: string): Promise<void> {
    this.objects.delete(`${bucket}/${objectPath}`);
    return Promise.resolve();
  }

  public createSignedReadUrl(
    bucket: string,
    objectPath: string,
    ttlSeconds: number,
    options?: { download?: boolean | string },
  ): Promise<string> {
    void ttlSeconds;
    void options;
    return Promise.resolve(`https://storage.test/${bucket}/${objectPath}`);
  }

  public clear(): void {
    this.objects.clear();
  }
}
