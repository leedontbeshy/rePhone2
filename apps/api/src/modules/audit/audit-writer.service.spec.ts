import { describe, expect, it, vi } from 'vitest';
import type { Prisma } from '../../generated/prisma/client.js';
import { AuditWriter } from './audit-writer.service.js';

describe('AuditWriter', () => {
  it('sanitizes changes and metadata before the owning transaction writes them', async () => {
    const create = vi.fn((input: unknown) => {
      void input;
      return Promise.resolve({ id: 'audit-1' });
    });
    const transaction = {
      auditLog: { create },
    } as unknown as Prisma.TransactionClient;

    await new AuditWriter().write(
      transaction,
      {
        actorUserId: '019b7df4-794f-7aa2-b937-ad1743712480',
        requestId: 'request-audit-writer',
        ipAddress: '127.0.0.1',
      },
      {
        action: 'employee.disabled',
        resourceType: 'User',
        resourceId: '019b7df4-9e25-7fc5-81f7-5f76482c377f',
        changes: {
          before: { status: 'ACTIVE', passwordHash: 'must-not-persist' },
          after: { status: 'DISABLED' },
        },
        metadata: {
          reasonLength: 18,
          resetToken: 'must-not-persist',
          evidence: { evidenceUrl: 'https://private.example/evidence', mimeType: 'image/png' },
        },
      },
    );

    expect(create).toHaveBeenCalledOnce();
    expect(create.mock.calls[0]?.[0]).toMatchObject({
      data: {
        changes: {
          before: { status: 'ACTIVE' },
          after: { status: 'DISABLED' },
        },
        metadata: {
          reasonLength: 18,
          evidence: { mimeType: 'image/png' },
        },
      },
    });
  });
});
