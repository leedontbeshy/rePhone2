export const STORAGE_PROVIDER = Symbol('STORAGE_PROVIDER');

export interface StoredObject {
  bucket: string;
  objectPath: string;
  mimeType: string;
  fileSize: number;
}

export interface UploadObjectInput {
  bucket: string;
  objectPath: string;
  bytes: Uint8Array;
  mimeType: string;
}

export interface StorageProvider {
  /** Performs a read-only provider availability check without returning bucket metadata. */
  probe?(): Promise<void>;
  upload(input: UploadObjectInput): Promise<StoredObject>;
  delete(bucket: string, objectPath: string): Promise<void>;
  createSignedReadUrl(
    bucket: string,
    objectPath: string,
    ttlSeconds: number,
    options?: { download?: boolean | string },
  ): Promise<string>;
}
