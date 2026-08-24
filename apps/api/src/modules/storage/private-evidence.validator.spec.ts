import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { ApiError } from '../../common/errors/api-error.js';
import {
  MAX_PRIVATE_EVIDENCE_BYTES,
  PrivateEvidenceValidator,
} from './private-evidence.validator.js';

describe('PrivateEvidenceValidator', () => {
  const validator = new PrivateEvidenceValidator();

  it('returns a deterministic SHA-256 fingerprint for exact replay detection', async () => {
    const bytes = readFileSync(
      new URL('../../../prisma/demo-assets/catalog/iphone-13.png', import.meta.url),
    );
    const expectedDigest = createHash('sha256').update(bytes).digest('hex');

    const first = await validator.validate(file(bytes, 'image/png', 'first-name.png'));
    const replay = await validator.validate(file(bytes, 'image/png', 'renamed-proof.png'));

    expect(first).toMatchObject({
      mimeType: 'image/png',
      extension: 'png',
      fileSize: bytes.byteLength,
      sha256: expectedDigest,
    });
    expect(replay.sha256).toBe(first.sha256);
    expect(first.sha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it('produces a different fingerprint for a different valid evidence file', async () => {
    const firstBytes = readFileSync(
      new URL('../../../prisma/demo-assets/catalog/iphone-13.png', import.meta.url),
    );
    const secondBytes = readFileSync(
      new URL('../../../prisma/demo-assets/catalog/iphone-14-pro.png', import.meta.url),
    );

    const first = await validator.validate(file(firstBytes, 'image/png', 'first.png'));
    const second = await validator.validate(file(secondBytes, 'image/png', 'second.png'));

    expect(second.sha256).not.toBe(first.sha256);
  });

  it('rejects an oversized upload before content parsing', async () => {
    const bytes = Buffer.alloc(MAX_PRIVATE_EVIDENCE_BYTES + 1);

    await expect(
      validator.validate(file(bytes, 'application/pdf', 'oversized.pdf')),
    ).rejects.toMatchObject({ code: 'FILE_TOO_LARGE' } satisfies Partial<ApiError>);
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
