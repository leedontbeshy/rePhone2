import type {
  StorageProvider,
  StoredObject,
  UploadObjectInput,
} from '../../src/common/providers/storage-provider.js';
import type { MailMessage, MailProvider } from '../../src/common/providers/mail-provider.js';

export class InMemoryStorageProvider implements StorageProvider {
  public readonly objects = new Map<string, UploadObjectInput>();

  public upload(input: UploadObjectInput): Promise<StoredObject> {
    const key = `${input.bucket}/${input.objectPath}`;
    if (this.objects.has(key)) {
      throw new Error('Object already exists');
    }
    this.objects.set(key, input);
    return Promise.resolve({
      bucket: input.bucket,
      objectPath: input.objectPath,
      mimeType: input.mimeType,
      fileSize: input.bytes.byteLength,
    });
  }

  public delete(bucket: string, objectPath: string): Promise<void> {
    this.objects.delete(`${bucket}/${objectPath}`);
    return Promise.resolve();
  }

  public createSignedReadUrl(
    bucket: string,
    objectPath: string,
    ttlSeconds: number,
  ): Promise<string> {
    return Promise.resolve(
      `https://storage.test/${bucket}/${objectPath}?ttl=${ttlSeconds.toString()}`,
    );
  }
}

export class InMemoryMailProvider implements MailProvider {
  public readonly messages: MailMessage[] = [];

  public send(message: MailMessage): Promise<void> {
    this.messages.push(message);
    return Promise.resolve();
  }
}
