import { describe, expect, it } from 'vitest';
import type { components } from '@rephone/api-client';
import {
  afterSalesJourney,
  afterSalesStatus,
  afterSalesTypeLabel,
  afterSalesWarrantyLabel,
  attachmentTypeLabel,
} from './after-sales-presenter';

type Detail = components['schemas']['AfterSalesDetailDto'];

const BASE = {
  requestNumber: 'RPH-AS-20260828-ABC234',
  type: 'RETURN',
  status: 'INSPECTING',
  issueDescription: 'Sản phẩm hoạt động không ổn định.',
  requestedAt: '2026-08-25T01:00:00.000Z',
  updatedAt: '2026-08-27T01:00:00.000Z',
  orderItem: {
    id: '0199b354-d818-7f7c-b966-3932599978d0',
    orderNumber: 'RPH-20260825-ABC23456',
    productName: 'iPhone 14 Pro',
    variantName: '256 GB · Đen không gian',
    quantity: 1,
  },
  attachments: [],
  availableActions: ['UPLOAD_ATTACHMENT'],
  timeline: {
    requestedAt: '2026-08-25T01:00:00.000Z',
    receivedAt: '2026-08-26T01:00:00.000Z',
    inspectedAt: '2026-08-27T01:00:00.000Z',
  },
} satisfies Detail;

describe('after-sales presenter', () => {
  it('uses neutral customer labels', () => {
    expect(afterSalesTypeLabel('EXCHANGE')).toBe('Yêu cầu đổi sản phẩm');
    expect(afterSalesStatus('INSPECTING')).toEqual({ label: 'Đang kiểm tra', tone: 'warning' });
    expect(attachmentTypeLabel('image/jpeg')).toBe('Ảnh JPEG');
  });

  it('renders rejected and cancelled as terminal branches', () => {
    const rejected = afterSalesJourney({
      ...BASE,
      status: 'REJECTED',
      timeline: { ...BASE.timeline, decidedAt: '2026-08-28T01:00:00.000Z' },
    });
    expect(rejected.at(-1)).toMatchObject({ id: 'rejected', state: 'terminal', tone: 'danger' });

    const cancelled = afterSalesJourney({
      ...BASE,
      status: 'CANCELLED',
      timeline: { ...BASE.timeline, cancelledAt: '2026-08-28T01:00:00.000Z' },
    });
    expect(cancelled.map((stage) => stage.id)).toEqual(['requested', 'cancelled']);
    expect(cancelled.at(-1)?.state).toBe('terminal');
  });

  it.each(['REQUESTED', 'RECEIVED', 'INSPECTING', 'APPROVED'] as const)(
    'keeps %s as the current stage even when its timestamp exists',
    (status) => {
      const stages = afterSalesJourney({
        ...BASE,
        status,
        timeline: {
          ...BASE.timeline,
          ...(status === 'APPROVED' ? { decidedAt: '2026-08-28T01:00:00.000Z' } : {}),
        },
      });
      expect(stages.filter((stage) => stage.state === 'current')).toHaveLength(1);
    },
  );

  it('labels an active warranty before its start as not effective yet', () => {
    expect(
      afterSalesWarrantyLabel(
        {
          warrantyCode: 'BH-01',
          status: 'ACTIVE',
          isValid: false,
          isExpired: false,
          startAt: '2026-09-01T00:00:00.000Z',
          endAt: '2027-09-01T00:00:00.000Z',
        },
        Date.parse('2026-08-28T00:00:00.000Z'),
      ),
    ).toBe('Chưa có hiệu lực');
  });
});
