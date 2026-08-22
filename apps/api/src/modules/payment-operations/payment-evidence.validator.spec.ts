import { readFileSync } from 'node:fs';
import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import type { ApiError } from '../../common/errors/api-error.js';
import { PaymentEvidenceValidator } from './payment-evidence.validator.js';

describe('PaymentEvidenceValidator', () => {
  const validator = new PaymentEvidenceValidator();

  it('accepts detected raster evidence without trusting the file name', async () => {
    const buffer = readFileSync(
      new URL('../../../prisma/demo-assets/catalog/iphone-13.png', import.meta.url),
    );
    await expect(
      validator.validate(file(buffer, 'image/png', 'receipt.exe')),
    ).resolves.toMatchObject({
      mimeType: 'image/png',
      extension: 'png',
      fileSize: buffer.byteLength,
    });
  });

  it('parses a structurally valid PDF', async () => {
    const document = await PDFDocument.create();
    document.addPage([200, 200]);
    const bytes = Buffer.from(await document.save());
    await expect(
      validator.validate(file(bytes, 'application/pdf', 'proof.pdf')),
    ).resolves.toMatchObject({
      mimeType: 'application/pdf',
      extension: 'pdf',
    });
  });

  it('rejects empty, spoofed and malformed evidence', async () => {
    await expect(
      validator.validate(file(Buffer.alloc(0), 'image/png', 'empty.png')),
    ).rejects.toMatchObject({ code: 'EVIDENCE_REQUIRED' } satisfies Partial<ApiError>);

    const image = readFileSync(
      new URL('../../../prisma/demo-assets/catalog/iphone-13.png', import.meta.url),
    );
    await expect(
      validator.validate(file(image, 'application/pdf', 'spoof.pdf')),
    ).rejects.toMatchObject({ code: 'UNSUPPORTED_FILE_TYPE' } satisfies Partial<ApiError>);

    const malformedPdf = Buffer.from('%PDF-1.7\nnot-a-real-document\n%%EOF');
    await expect(
      validator.validate(file(malformedPdf, 'application/pdf', 'broken.pdf')),
    ).rejects.toMatchObject({ code: 'EVIDENCE_INVALID' } satisfies Partial<ApiError>);
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
