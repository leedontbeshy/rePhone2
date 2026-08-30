import { createRef } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { RefundDetail, RefundListItem } from '@/lib/refund-api';
import { RefundActionDialog, RefundRecord, validateRefundDecision } from './refund-detail-view';
import { RefundQueueTable } from './refund-queue-view';

describe('FE-07 refund views', () => {
  it('keeps existing queue rows visible while a URL-driven refresh is loading', () => {
    const markup = renderToStaticMarkup(<RefundQueueTable loading refunds={[refundListItem()]} />);

    expect(markup).toContain('aria-busy="true"');
    expect(markup).toContain('RPH-20260829-ABC123');
    expect(markup).toContain('Đang cập nhật dữ liệu');
    expect(markup).not.toContain('BANK_TRANSFER');
  });

  it('renders only actions granted to the current actor by the server', () => {
    const markup = renderToStaticMarkup(
      <RefundRecord
        busy={null}
        detail={refundDetail({ availableActions: ['START_PROCESSING', 'REJECT', 'CANCEL'] })}
        onEvidence={vi.fn()}
        onOpenDecision={vi.fn()}
      />,
    );

    expect(markup).toContain('Xử lý hoàn tiền');
    expect(markup).toContain('Nhận xử lý');
    expect(markup).toContain('Từ chối yêu cầu');
    expect(markup).toContain('Hủy yêu cầu');
    expect(markup).not.toContain('Xác nhận đã chuyển khoản');
    expect(markup).not.toContain('START_PROCESSING');
    expect(markup).not.toContain('refundableAmount');
    expect(markup).not.toContain('fulfillmentType');
  });

  it('does not infer completion for a processing refund when actor actions are empty', () => {
    const markup = renderToStaticMarkup(
      <RefundRecord
        busy={null}
        detail={refundDetail({ status: 'PROCESSING', availableActions: [] })}
        onEvidence={vi.fn()}
        onOpenDecision={vi.fn()}
      />,
    );

    expect(markup).toContain('Hồ sơ hiện không còn thao tác thay đổi trạng thái.');
    expect(markup).not.toContain('Xác nhận đã chuyển khoản');
    expect(markup).not.toContain('Xác nhận đã hoàn tiền mặt');
  });

  it('keeps a terminal record read-only while allowing fresh evidence access', () => {
    const markup = renderToStaticMarkup(
      <RefundRecord
        busy={null}
        detail={refundDetail({
          status: 'COMPLETED',
          evidenceAvailable: true,
          availableActions: ['VIEW_EVIDENCE'],
          completedAt: '2026-08-29T08:30:00.000Z',
        })}
        onEvidence={vi.fn()}
        onOpenDecision={vi.fn()}
      />,
    );

    expect(markup).toContain('Mở minh chứng');
    expect(markup).toContain('Hồ sơ hiện không còn thao tác thay đổi trạng thái.');
    expect(markup).not.toContain('Nhận xử lý');
  });

  it('uses the custom bank file picker and keeps the selected file represented', () => {
    const file = new File(['proof'], 'xac-nhan-hoan-tien.pdf', { type: 'application/pdf' });
    const markup = renderToStaticMarkup(
      <RefundActionDialog
        actionAllowed
        busy={false}
        decision="COMPLETE_BANK_TRANSFER"
        error="Chưa thể lưu minh chứng."
        evidenceFile={file}
        fileInputRef={createRef<HTMLInputElement>()}
        note="Đã chuyển đủ số tiền"
        reason=""
        refundAmount="3000000"
        onClose={vi.fn()}
        onEvidenceFile={vi.fn()}
        onNote={vi.fn()}
        onReason={vi.fn()}
        onRemoveEvidence={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );

    expect(markup).toContain('type="file"');
    expect(markup).toContain('xac-nhan-hoan-tien.pdf');
    expect(markup).toContain('Bỏ tệp đã chọn');
    expect(markup).toContain('Chưa thể lưu minh chứng.');
    expect(markup).toContain('noValidate=""');
    expect(markup).toContain('aria-labelledby="refund-evidence-label"');
  });

  it('never shows a file picker for cash completion', () => {
    const markup = renderToStaticMarkup(
      <RefundActionDialog
        actionAllowed
        busy={false}
        decision="COMPLETE_CASH"
        error={null}
        evidenceFile={null}
        fileInputRef={createRef<HTMLInputElement>()}
        note="Đã giao đủ tiền mặt"
        reason=""
        refundAmount="3000000"
        onClose={vi.fn()}
        onEvidenceFile={vi.fn()}
        onNote={vi.fn()}
        onReason={vi.fn()}
        onRemoveEvidence={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );

    expect(markup).not.toContain('type="file"');
    expect(markup).not.toContain('Minh chứng chuyển khoản');
    expect(markup).toContain('Ghi chú hoàn tất');
  });

  it('does not create a completion path for the other method', () => {
    const markup = renderToStaticMarkup(
      <RefundRecord
        busy={null}
        detail={refundDetail({
          method: 'OTHER',
          availableActions: ['REJECT', 'CANCEL'],
        })}
        onEvidence={vi.fn()}
        onOpenDecision={vi.fn()}
      />,
    );

    expect(markup).toContain('Phương thức khác');
    expect(markup).toContain('Từ chối yêu cầu');
    expect(markup).toContain('Hủy yêu cầu');
    expect(markup).not.toContain('Xác nhận đã chuyển khoản');
    expect(markup).not.toContain('Xác nhận đã hoàn tiền mặt');
  });

  it('validates bank evidence without mutating the selected file', () => {
    const file = new File(['proof'], 'xac-nhan.pdf', { type: 'application/pdf' });

    expect(
      validateRefundDecision('COMPLETE_BANK_TRANSFER', 'Đã chuyển đủ tiền', '', file),
    ).toBeNull();
    expect(file.name).toBe('xac-nhan.pdf');
    expect(validateRefundDecision('COMPLETE_BANK_TRANSFER', 'Đã chuyển đủ tiền', '', null)).toBe(
      'Hãy chọn minh chứng chuyển khoản.',
    );
  });
});

function refundListItem(overrides: Partial<RefundListItem> = {}): RefundListItem {
  return {
    id: 'refund-id',
    orderNumber: 'RPH-20260829-ABC123',
    amount: '3000000',
    method: 'BANK_TRANSFER',
    status: 'REQUESTED',
    requestedByType: 'STAFF',
    requester: { id: 'staff-id', fullName: 'Nhân viên Demo', employeeCode: 'EMP001' },
    evidenceAvailable: false,
    processingAt: null,
    completedAt: null,
    terminalAt: null,
    createdAt: '2026-08-29T08:00:00.000Z',
    ...overrides,
  };
}

function refundDetail(overrides: Partial<RefundDetail> = {}): RefundDetail {
  return {
    ...refundListItem(),
    reason: 'Hoàn cọc cho đơn hàng đã hủy',
    note: null,
    processor: null,
    terminalActor: null,
    terminalReason: null,
    availableActions: ['START_PROCESSING', 'REJECT', 'CANCEL'],
    order: {
      id: 'order-id',
      orderNumber: 'RPH-20260829-ABC123',
      status: 'CANCELLED',
      fulfillmentStatus: 'CANCELLED',
      paymentStatus: 'REFUND_PENDING',
      customerName: 'Khách Demo',
      customerEmail: 'khach@example.com',
      grandTotal: '15990000',
      paidAmount: '3000000',
      refundedAmount: '0',
      balanceDue: '12990000',
    },
    payment: {
      id: 'payment-id',
      purpose: 'DEPOSIT',
      method: 'BANK_TRANSFER',
      status: 'VERIFIED',
      expectedAmount: '3000000',
      receivedAmount: '3000000',
    },
    ...overrides,
  };
}
