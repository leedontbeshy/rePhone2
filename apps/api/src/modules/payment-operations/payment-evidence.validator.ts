import { Injectable } from '@nestjs/common';
import { fileTypeFromBuffer } from 'file-type';
import { PDFDocument } from 'pdf-lib';
import sharp from 'sharp';
import { ApiError } from '../../common/errors/api-error.js';

export const MAX_PAYMENT_EVIDENCE_BYTES = 10 * 1024 * 1024;

const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);

export interface ValidatedPaymentEvidence {
  bytes: Uint8Array;
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp' | 'application/pdf';
  extension: 'jpg' | 'png' | 'webp' | 'pdf';
  fileSize: number;
}

@Injectable()
export class PaymentEvidenceValidator {
  public async validate(file: Express.Multer.File | undefined): Promise<ValidatedPaymentEvidence> {
    if (file === undefined || file.size === 0 || file.buffer.byteLength === 0) {
      throw new ApiError('EVIDENCE_REQUIRED', undefined, [
        { field: 'file', code: 'EVIDENCE_REQUIRED', message: 'EVIDENCE_REQUIRED' },
      ]);
    }
    if (
      file.size > MAX_PAYMENT_EVIDENCE_BYTES ||
      file.buffer.byteLength > MAX_PAYMENT_EVIDENCE_BYTES
    ) {
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
      if (detected.mime === 'application/pdf') {
        const document = await PDFDocument.load(file.buffer, {
          ignoreEncryption: false,
          updateMetadata: false,
        });
        if (document.getPageCount() < 1) throw new Error('PDF has no pages');
      } else {
        const metadata = await sharp(file.buffer, {
          failOn: 'error',
          limitInputPixels: 40_000_000,
        }).metadata();
        if (metadata.width <= 0 || metadata.height <= 0) {
          throw new Error('Image has invalid dimensions');
        }
      }
    } catch {
      throw new ApiError('EVIDENCE_INVALID');
    }

    const mimeType = detected.mime as ValidatedPaymentEvidence['mimeType'];
    return {
      bytes: file.buffer,
      mimeType,
      extension:
        mimeType === 'image/jpeg'
          ? 'jpg'
          : mimeType === 'image/png'
            ? 'png'
            : mimeType === 'image/webp'
              ? 'webp'
              : 'pdf',
      fileSize: file.buffer.byteLength,
    };
  }
}
