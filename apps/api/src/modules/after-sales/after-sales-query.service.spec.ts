import type { Request } from 'express';
import { describe, expect, it, vi } from 'vitest';
import type { AppConfig } from '../../config/app-config.js';
import type { PrismaService } from '../../database/prisma.service.js';
import type { AuditWriter } from '../audit/audit-writer.service.js';
import type { OrderOwnershipPolicy } from '../order-transaction-ports/order-ownership.policy.js';
import type { StorageProvider } from '../../common/providers/storage-provider.js';
import { AfterSalesQueryService } from './after-sales-query.service.js';
import type { AfterSalesPublicRecord } from './after-sales.repository.js';
import type { AfterSalesRepository } from './after-sales.repository.js';

describe('AfterSalesQueryService', () => {
  it('commits the safe view audit before issuing a URL capped at 300 seconds', async () => {
    const sequence: string[] = [];
    const record = caseRecord();
    const service = new AfterSalesQueryService(
      { findByRequestNumber: vi.fn().mockResolvedValue(record) } as unknown as AfterSalesRepository,
      { assertAccess: vi.fn() } as unknown as OrderOwnershipPolicy,
      {
        createSignedReadUrl: vi.fn(() => {
          sequence.push('signed-url');
          return Promise.resolve('https://storage.test/signed');
        }),
      } as unknown as StorageProvider,
      { storage: { signedUrlTtlSeconds: 900 } } as AppConfig,
      {
        $transaction: vi.fn((work: (transaction: unknown) => Promise<unknown>) => {
          sequence.push('transaction');
          return work({});
        }),
      } as unknown as PrismaService,
      {
        write: vi.fn(() => {
          sequence.push('audit');
          return Promise.resolve(undefined);
        }),
      } as unknown as AuditWriter,
      { now: () => new Date('2026-08-25T10:00:00.000Z') },
    );

    const result = await service.attachmentUrl(
      request(),
      record.requestNumber,
      '00000000-0000-4000-8000-000000000001',
    );

    expect(sequence).toEqual(['transaction', 'audit', 'signed-url']);
    expect(result).toEqual({
      url: 'https://storage.test/signed',
      expiresAt: '2026-08-25T10:05:00.000Z',
    });
  });
});

function caseRecord(): AfterSalesPublicRecord {
  return {
    id: '00000000-0000-4000-8000-000000000010',
    requestNumber: 'RPH-AS-20260825-234567',
    attachments: [
      {
        id: '00000000-0000-4000-8000-000000000001',
        bucket: 'rephone-private',
        objectPath: 'after-sales/case/file.pdf',
        mimeType: 'application/pdf',
        fileSize: 200,
        uploadedByType: 'GUEST',
        uploadedById: null,
        uploadedAt: '2026-08-25T09:00:00.000Z',
      },
    ],
    orderItem: {
      order: {
        customerId: '00000000-0000-4000-8000-000000000030',
        guestAccessTokenHash: null,
        sourceCart: { status: 'CONVERTED', guestTokenHash: null, expiresAt: null },
      },
    },
  } as unknown as AfterSalesPublicRecord;
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
