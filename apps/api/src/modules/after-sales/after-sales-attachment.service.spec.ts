import type { Request } from 'express';
import { describe, expect, it, vi } from 'vitest';
import type { UploadObjectInput } from '../../common/providers/storage-provider.js';
import type { AppConfig } from '../../config/app-config.js';
import type { SerializableTransactionRunner } from '../../database/serializable-transaction.runner.js';
import type { OrderOwnershipPolicy } from '../order-transaction-ports/order-ownership.policy.js';
import { AfterSalesAttachmentService } from './after-sales-attachment.service.js';
import type { AfterSalesPublicRecord } from './after-sales.repository.js';
import type { AfterSalesRepository } from './after-sales.repository.js';

describe('AfterSalesAttachmentService', () => {
  it('stores USER metadata, emits the accepted audit action and exposes no private path', async () => {
    const fixture = setup([]);

    const result = await fixture.service.upload(
      fixture.request,
      fixture.record.requestNumber,
      file(),
    );

    const update = fixture.repository.update.mock.calls[0]?.[1] as {
      attachments: Array<Record<string, unknown>>;
    };
    expect(update.attachments[0]).toEqual(
      expect.objectContaining({
        uploadedByType: 'USER',
        uploadedById: fixture.request.auth?.userId,
      }),
    );
    expect(fixture.audit.write).toHaveBeenCalledWith(
      fixture.transaction,
      expect.any(Object),
      expect.objectContaining({ action: 'after_sales.attachment_added' }),
    );
    expect(JSON.stringify(result)).not.toContain('rephone-private');
    expect(JSON.stringify(result)).not.toContain('after-sales/');
  });

  it('deletes the just-uploaded object when the locked case already has five files', async () => {
    const attachments = Array.from({ length: 5 }, (_, index) => attachment(index));
    const fixture = setup(attachments);

    await expect(
      fixture.service.upload(fixture.request, fixture.record.requestNumber, file()),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    expect(fixture.storage.delete).toHaveBeenCalledWith(
      'rephone-private',
      expect.stringContaining(`after-sales/${fixture.record.id}/`),
    );
    expect(fixture.repository.update).not.toHaveBeenCalled();
  });
});

function setup(attachments: Array<Record<string, unknown>>) {
  const now = new Date('2026-08-25T10:00:00.000Z');
  const transaction = {};
  const record = caseRecord(now, attachments);
  const repository = {
    findByRequestNumber: vi.fn().mockResolvedValue(record),
    lockById: vi.fn().mockResolvedValue(record),
    update: vi.fn((_id: string, data: Record<string, unknown>) =>
      Promise.resolve({ ...record, ...data }),
    ),
  };
  const storage = {
    upload: vi.fn((input: UploadObjectInput) =>
      Promise.resolve({
        bucket: input.bucket,
        objectPath: input.objectPath,
        mimeType: input.mimeType,
        fileSize: input.bytes.byteLength,
      }),
    ),
    delete: vi.fn().mockResolvedValue(undefined),
    createSignedReadUrl: vi.fn(),
  };
  const audit = { write: vi.fn().mockResolvedValue(undefined) };
  const service = new AfterSalesAttachmentService(
    repository as unknown as AfterSalesRepository,
    { assertAccess: vi.fn() } as unknown as OrderOwnershipPolicy,
    {
      validate: vi.fn().mockResolvedValue({
        bytes: new Uint8Array([1, 2, 3]),
        mimeType: 'image/jpeg',
        extension: 'jpg',
        fileSize: 3,
        sha256: 'a'.repeat(64),
      }),
    },
    storage,
    { storage: { privateBucket: 'rephone-private' } } as AppConfig,
    {
      run: vi.fn(async (_operation, work) =>
        (work as (tx: unknown) => Promise<unknown>)(transaction),
      ),
    } as unknown as SerializableTransactionRunner,
    audit,
    { now: () => now },
  );
  return { service, repository, storage, audit, transaction, record, request: request() };
}

function caseRecord(
  now: Date,
  attachments: Array<Record<string, unknown>>,
): AfterSalesPublicRecord {
  return {
    id: '00000000-0000-4000-8000-000000000010',
    requestNumber: 'RPH-AS-20260825-234567',
    status: 'REQUESTED',
    attachments,
    orderItem: {
      order: {
        customerId: '00000000-0000-4000-8000-000000000030',
        guestAccessTokenHash: null,
        sourceCart: { status: 'CONVERTED', guestTokenHash: null, expiresAt: null },
      },
    },
    requestedAt: now,
    updatedAt: now,
  } as unknown as AfterSalesPublicRecord;
}

function attachment(index: number): Record<string, unknown> {
  return {
    id: `00000000-0000-4000-8000-${(index + 1).toString().padStart(12, '0')}`,
    bucket: 'rephone-private',
    objectPath: `after-sales/case/file-${index.toString()}.jpg`,
    mimeType: 'image/jpeg',
    fileSize: 3,
    uploadedByType: 'USER',
    uploadedById: '00000000-0000-4000-8000-000000000030',
    uploadedAt: '2026-08-25T09:00:00.000Z',
  };
}

function file(): Express.Multer.File {
  return { buffer: Buffer.from([1, 2, 3]), size: 3, mimetype: 'image/jpeg' } as Express.Multer.File;
}

function request(): Request {
  return {
    auth: {
      userId: '00000000-0000-4000-8000-000000000030',
      role: 'CUSTOMER',
      sessionId: 'session-1',
    },
    id: 'request-1',
    ip: '127.0.0.1',
    socket: { remoteAddress: '127.0.0.1' },
    get: () => undefined,
  } as unknown as Request;
}
