import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { ApiError } from '../../common/errors/api-error.js';
import { ImageUploadValidator } from './image-upload.validator.js';

describe('ImageUploadValidator', () => {
  const validator = new ImageUploadValidator();

  it('detects a valid raster image from bytes and returns canonical metadata', async () => {
    const buffer = readFileSync(
      new URL('../../../prisma/demo-assets/catalog/iphone-13.png', import.meta.url),
    );
    const result = await validator.validate(file(buffer, 'image/png', 'ignored-user-name.svg'));

    expect(result).toMatchObject({
      mimeType: 'image/png',
      extension: 'png',
      fileSize: buffer.byteLength,
    });
    expect(result.width).toBeGreaterThan(0);
    expect(result.height).toBeGreaterThan(0);
  });

  it('rejects empty and MIME-spoofed files', async () => {
    await expect(
      validator.validate(file(Buffer.alloc(0), 'image/png', 'empty.png')),
    ).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    } satisfies Partial<ApiError>);
    const buffer = readFileSync(
      new URL('../../../prisma/demo-assets/catalog/iphone-13.png', import.meta.url),
    );
    await expect(validator.validate(file(buffer, 'image/jpeg', 'spoof.jpg'))).rejects.toMatchObject(
      {
        code: 'UNSUPPORTED_FILE_TYPE',
      } satisfies Partial<ApiError>,
    );
  });
});

function file(buffer: Buffer, mimetype: string, originalname: string): Express.Multer.File {
  return {
    fieldname: 'file',
    originalname,
    encoding: '7bit',
    mimetype,
    size: buffer.byteLength,
    buffer,
    destination: '',
    filename: '',
    path: '',
    stream: undefined as never,
  };
}
