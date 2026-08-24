import { describe, expect, it } from 'vitest';
import { ApiError } from '../../common/errors/api-error.js';
import { parseAfterSalesAttachments, projectAfterSalesDetail } from './after-sales.projector.js';
import type { AfterSalesPublicRecord } from './after-sales.repository.js';

describe('after-sales public projector', () => {
  it('keeps private storage coordinates out of the owner response', () => {
    const projected = projectAfterSalesDetail(record(), new Date('2026-08-25T10:00:00.000Z'));

    expect(projected.attachments).toEqual([
      {
        id: '00000000-0000-4000-8000-000000000001',
        mimeType: 'image/jpeg',
        fileSize: 123,
        uploadedAt: '2026-08-25T09:00:00.000Z',
      },
    ]);
    expect(JSON.stringify(projected)).not.toContain('rephone-private');
    expect(JSON.stringify(projected)).not.toContain('after-sales/case-1');
    expect(projected.availableActions).toEqual(['UPLOAD_ATTACHMENT', 'CANCEL']);
  });

  it('accepts only the canonical USER or GUEST uploader types', () => {
    const attachment = (record().attachments as unknown[])[0] as Record<string, unknown>;
    expect(() =>
      parseAfterSalesAttachments([{ ...attachment, uploadedByType: 'CUSTOMER' }]),
    ).toThrow(ApiError);
  });
});

function record(): AfterSalesPublicRecord {
  const requestedAt = new Date('2026-08-25T08:00:00.000Z');
  return {
    id: '00000000-0000-4000-8000-000000000010',
    requestNumber: 'RPH-AS-20260825-234567',
    warrantyId: null,
    orderItemId: '00000000-0000-4000-8000-000000000020',
    customerId: '00000000-0000-4000-8000-000000000030',
    type: 'RETURN',
    issueDescription: 'Máy có lỗi màn hình sau khi nhận.',
    requestedResolution: null as never,
    status: 'REQUESTED',
    attachments: [
      {
        id: '00000000-0000-4000-8000-000000000001',
        bucket: 'rephone-private',
        objectPath: 'after-sales/case-1/file.jpg',
        mimeType: 'image/jpeg',
        fileSize: 123,
        uploadedByType: 'USER',
        uploadedById: '00000000-0000-4000-8000-000000000030',
        uploadedAt: '2026-08-25T09:00:00.000Z',
      },
    ],
    decisionNote: null,
    resolutionType: null,
    resolutionNote: null,
    cancelReason: null,
    requestedAt,
    receivedAt: null,
    inspectedAt: null,
    decidedAt: null,
    resolvedAt: null,
    returnedAt: null,
    cancelledAt: null,
    createdAt: requestedAt,
    updatedAt: requestedAt,
    warranty: null,
    orderItem: {
      id: '00000000-0000-4000-8000-000000000020',
      productId: '00000000-0000-4000-8000-000000000040',
      variantId: '00000000-0000-4000-8000-000000000050',
      inventoryUnitId: '00000000-0000-4000-8000-000000000060',
      productTypeSnapshot: 'IPHONE',
      productNameSnapshot: 'iPhone 15',
      variantNameSnapshot: '128GB',
      inventoryCodeSnapshot: 'RPH-DEMO-001',
      quantity: 1,
      order: {
        id: '00000000-0000-4000-8000-000000000070',
        orderNumber: 'RPH-20260825-23456789',
        customerId: '00000000-0000-4000-8000-000000000030',
        guestAccessTokenHash: null,
        customerEmail: 'customer@example.com',
        status: 'COMPLETED',
        completedAt: requestedAt,
        sourceCart: { status: 'CONVERTED', guestTokenHash: null, expiresAt: null },
      },
    },
  };
}
