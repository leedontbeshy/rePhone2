import { Injectable } from '@nestjs/common';
import { fileTypeFromBuffer } from 'file-type';
import sharp from 'sharp';
import { ApiError } from '../../common/errors/api-error.js';

const MAX_STORE_QR_BYTES = 5 * 1024 * 1024;
const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp']);

export interface ValidatedStoreQrImage {
  bytes: Uint8Array;
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
  extension: 'jpg' | 'png' | 'webp';
  fileSize: number;
}

@Injectable()
export class StoreQrImageValidator {
  public async validate(file: Express.Multer.File | undefined): Promise<ValidatedStoreQrImage> {
    if (file === undefined || file.size === 0 || file.buffer.byteLength === 0) {
      throw new ApiError('VALIDATION_FAILED', undefined, [
        { field: 'file', code: 'FILE_REQUIRED', message: 'FILE_REQUIRED' },
      ]);
    }
    if (file.size > MAX_STORE_QR_BYTES || file.buffer.byteLength > MAX_STORE_QR_BYTES) {
      throw new ApiError('FILE_TOO_LARGE');
    }
    const detected = await fileTypeFromBuffer(file.buffer);
    if (detected === undefined || !ALLOWED.has(detected.mime) || file.mimetype !== detected.mime) {
      throw new ApiError('UNSUPPORTED_FILE_TYPE');
    }
    try {
      const metadata = await sharp(file.buffer, {
        failOn: 'error',
        limitInputPixels: 40_000_000,
      }).metadata();
      if (metadata.width < 1 || metadata.height < 1) {
        throw new Error('invalid image dimensions');
      }
    } catch {
      throw new ApiError('UNSUPPORTED_FILE_TYPE');
    }
    const mimeType = detected.mime as ValidatedStoreQrImage['mimeType'];
    return {
      bytes: file.buffer,
      mimeType,
      extension: mimeType === 'image/jpeg' ? 'jpg' : mimeType === 'image/png' ? 'png' : 'webp',
      fileSize: file.buffer.byteLength,
    };
  }
}
