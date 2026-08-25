import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { StoreQrImageValidator } from './store-qr-image.validator.js';

describe('StoreQrImageValidator', () => {
  const validator = new StoreQrImageValidator();

  it('accepts a structurally valid image and canonicalizes its extension', async () => {
    const buffer = await sharp({
      create: { width: 2, height: 2, channels: 3, background: '#ffffff' },
    })
      .png()
      .toBuffer();

    await expect(validator.validate(file(buffer, 'image/png'))).resolves.toMatchObject({
      mimeType: 'image/png',
      extension: 'png',
      fileSize: buffer.byteLength,
    });
  });

  it('rejects MIME spoofing', async () => {
    const buffer = await sharp({
      create: { width: 2, height: 2, channels: 3, background: '#ffffff' },
    })
      .png()
      .toBuffer();

    await expect(validator.validate(file(buffer, 'image/jpeg'))).rejects.toMatchObject({
      code: 'UNSUPPORTED_FILE_TYPE',
    });
  });
});

function file(buffer: Buffer, mimetype: string): Express.Multer.File {
  return {
    fieldname: 'file',
    originalname: 'qr',
    encoding: '7bit',
    mimetype,
    size: buffer.byteLength,
    destination: '',
    filename: '',
    path: '',
    buffer,
    stream: undefined as never,
  };
}
