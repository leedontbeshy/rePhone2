import { Injectable } from '@nestjs/common';
import { fileTypeFromBuffer } from 'file-type';
import sharp from 'sharp';
import { ApiError } from '../../common/errors/api-error.js';

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export interface ValidatedImage {
  bytes: Uint8Array;
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
  extension: 'jpg' | 'png' | 'webp';
  fileSize: number;
  width: number;
  height: number;
}

@Injectable()
export class ImageUploadValidator {
  public async validate(file: Express.Multer.File | undefined): Promise<ValidatedImage> {
    if (file === undefined || file.size === 0 || file.buffer.byteLength === 0) {
      throw new ApiError('VALIDATION_FAILED', undefined, [
        { field: 'file', code: 'FILE_REQUIRED', message: 'FILE_REQUIRED' },
      ]);
    }
    if (file.size > MAX_IMAGE_BYTES || file.buffer.byteLength > MAX_IMAGE_BYTES) {
      throw new ApiError('FILE_TOO_LARGE');
    }
    const detected = await fileTypeFromBuffer(file.buffer);
    if (
      detected === undefined ||
      !ALLOWED_MIME_TYPES.has(detected.mime) ||
      file.mimetype !== detected.mime
    ) {
      throw new ApiError('UNSUPPORTED_FILE_TYPE');
    }
    try {
      const metadata = await sharp(file.buffer, {
        failOn: 'error',
        limitInputPixels: 40_000_000,
      }).metadata();
      if (metadata.width <= 0 || metadata.height <= 0) {
        throw new ApiError('UNSUPPORTED_FILE_TYPE');
      }
      const mimeType = detected.mime as ValidatedImage['mimeType'];
      return {
        bytes: file.buffer,
        mimeType,
        extension: mimeType === 'image/jpeg' ? 'jpg' : mimeType === 'image/png' ? 'png' : 'webp',
        fileSize: file.buffer.byteLength,
        width: metadata.width,
        height: metadata.height,
      };
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError('UNSUPPORTED_FILE_TYPE');
    }
  }
}
