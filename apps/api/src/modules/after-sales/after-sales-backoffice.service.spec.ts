import { describe, expect, it, vi } from 'vitest';
import type { BackofficeAfterSalesDetailDto } from './after-sales-backoffice-response.dto.js';
import { AfterSalesBackofficeService } from './after-sales-backoffice.service.js';

describe('AfterSalesBackofficeService', () => {
  it('sends one post-commit update for a changed lifecycle command', async () => {
    const sendUpdated = vi.fn().mockResolvedValue(undefined);
    const detail = detailRecord('RECEIVED');
    const service = createService(
      {
        receiveAfterSalesRequest: vi.fn().mockResolvedValue({ record: {}, changed: true }),
      },
      detail,
      sendUpdated,
    );

    await expect(
      service.receive('case-1', { receivedLocationId: uuid(1) }, actor(), 'EMPLOYEE'),
    ).resolves.toBe(detail);
    expect(sendUpdated).toHaveBeenCalledOnce();
    expect(sendUpdated).toHaveBeenCalledWith({
      requestId: 'case-1',
      requestNumber: 'RPH-AS-20260825-234567',
      orderNumber: 'RPH-20260825-ABCDEFGH',
      customerEmail: 'customer@example.com',
      status: 'RECEIVED',
    });
  });

  it('does not send a second notification for an exact replay', async () => {
    const sendUpdated = vi.fn().mockResolvedValue(undefined);
    const detail = detailRecord('RECEIVED');
    const service = createService(
      {
        receiveAfterSalesRequest: vi.fn().mockResolvedValue({ record: {}, changed: false }),
      },
      detail,
      sendUpdated,
    );

    await service.receive('case-1', { receivedLocationId: uuid(1) }, actor(), 'ADMIN');
    expect(sendUpdated).not.toHaveBeenCalled();
  });

  it('keeps assignment silent even when it changes', async () => {
    const sendUpdated = vi.fn().mockResolvedValue(undefined);
    const detail = detailRecord('REQUESTED');
    const service = createService(
      {
        assignAfterSalesRequest: vi.fn().mockResolvedValue({ record: {}, changed: true }),
      },
      detail,
      sendUpdated,
    );

    await service.assign('case-1', { employeeId: uuid(2) }, actor(), 'EMPLOYEE');
    expect(sendUpdated).not.toHaveBeenCalled();
  });
});

function createService(
  commands: Record<string, unknown>,
  detail: BackofficeAfterSalesDetailDto,
  sendUpdated: ReturnType<typeof vi.fn>,
) {
  return new AfterSalesBackofficeService(
    commands as never,
    { detail: vi.fn().mockResolvedValue(detail) } as never,
    { sendUpdated } as never,
  );
}

function detailRecord(status: string): BackofficeAfterSalesDetailDto {
  return {
    id: 'case-1',
    requestNumber: 'RPH-AS-20260825-234567',
    status,
    orderItem: { orderNumber: 'RPH-20260825-ABCDEFGH' },
    customer: { email: 'customer@example.com' },
  } as unknown as BackofficeAfterSalesDetailDto;
}

function actor() {
  return {
    actorUserId: uuid(3),
    requestId: 'request-slice11-backoffice',
    ipAddress: '127.0.0.1',
    userAgent: 'vitest',
  };
}

function uuid(value: number): string {
  return `0198e6c6-5798-7cde-a964-${value.toString().padStart(12, '0')}`;
}
