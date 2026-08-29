import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { BackofficeOrderDetail, BackofficeOrderListItem } from '@/lib/fulfillment-api';
import { OrderActionChoices, OrderActionPanel } from './order-action-panel';
import type { OrderActionSetters, OrderActionValues } from './order-action-fields';
import { OrderDetailView } from './order-detail-view';
import { OrderNoteForm } from './order-detail-sections';
import { OrderQueue } from './order-list-view';

vi.mock('next/navigation', () => ({
  usePathname: () => '/backoffice/orders/order-1',
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/app/auth-provider', () => ({
  useAuth: () => ({
    client: {},
    logout: vi.fn(),
    logoutPending: false,
    status: 'authenticated',
    user: { fullName: 'Nhân viên Demo', role: 'EMPLOYEE' },
  }),
}));

describe('order operations views', () => {
  it('renders a dense linked queue row with three Vietnamese statuses', () => {
    const markup = renderToStaticMarkup(<OrderQueue orders={[order()]} />);

    expect(markup).toContain('href="/backoffice/orders/order-1"');
    expect(markup).toContain('RPH-20260828-ABC12345');
    expect(markup).toContain('Đang xử lý');
    expect(markup).toContain('Đang giao hàng');
    expect(markup).toContain('Đã thanh toán một phần');
    expect(markup).toContain('Còn thu 10.000.000');
    expect(markup).toContain('Đơn hàng và khách:');
    expect(markup).toContain('Giao nhận:');
    expect(markup).toContain('Tài chính:');
    expect(markup).toContain('Trạng thái đơn hàng:');
    expect(markup).toContain('Tình trạng giao nhận:');
    expect(markup).toContain('Tình trạng thanh toán:');
    expect(markup).not.toContain('PROCESSING');
    expect(markup).not.toContain('IN_TRANSIT');
  });

  it('marks an overdue pickup without inventing product imagery', () => {
    const markup = renderToStaticMarkup(
      <OrderQueue
        orders={[
          order({
            fulfillmentStatus: 'READY',
            fulfillmentType: 'PICKUP',
            pickupHoldUntil: '2026-08-28T04:00:00.000Z',
            pickupOverdue: true,
          }),
        ]}
      />,
    );

    expect(markup).toContain('Nhận tại cửa hàng');
    expect(markup).toContain('Đã quá hạn');
    expect(markup).not.toContain('<img');
  });

  it('renders only actions supplied by the authoritative projection', () => {
    const markup = renderToStaticMarkup(
      <OrderActionChoices
        actions={['MARK_SHIPMENT_DELIVERED', 'MARK_SHIPMENT_FAILED']}
        selectedAction="MARK_SHIPMENT_DELIVERED"
        onSelect={() => undefined}
      />,
    );

    expect(markup).toContain('Xác nhận giao thành công');
    expect(markup).toContain('Ghi nhận giao hàng thất bại');
    expect(markup).not.toContain('Hủy đơn hàng');
    expect(markup).not.toContain('Tạo yêu cầu hoàn tiền');
  });

  it('locks every order write control while any operation is running', () => {
    const actionMarkup = renderToStaticMarkup(
      <OrderActionPanel
        busy="INTERNAL_NOTE"
        detail={
          {
            availableActions: ['HAND_OVER_SHIPMENT'],
            pricing: { balanceDue: '0' },
          } as BackofficeOrderDetail
        }
        returnLocations={[]}
        selectedAction="HAND_OVER_SHIPMENT"
        setters={actionSetters()}
        values={actionValues()}
        onSelect={() => undefined}
        onSubmit={() => undefined}
      />,
    );
    const noteMarkup = renderToStaticMarkup(
      <OrderNoteForm
        internalNote="Ghi chú"
        notePending={false}
        writesDisabled
        setInternalNote={() => undefined}
        onSaveNote={() => undefined}
      />,
    );

    expect(actionMarkup).toMatch(/<fieldset[^>]*disabled=""/);
    expect(noteMarkup).toMatch(/<fieldset[^>]*disabled=""/);
    expect(actionMarkup).toContain('aria-busy="true"');
    expect(noteMarkup).toContain('aria-busy="true"');
  });

  it('shows a loading state instead of a false not-found message before the first response', () => {
    const markup = renderToStaticMarkup(<OrderDetailView orderId="order-1" />);

    expect(markup).toContain('Đang tải chi tiết đơn hàng');
    expect(markup).not.toContain('Không tìm thấy đơn hàng');
  });
});

function actionSetters(): OrderActionSetters {
  const setter = () => undefined;
  return {
    setCancelReason: setter,
    setCarrierName: setter,
    setCashConfirmed: setter,
    setCodConfirmed: setter,
    setFailureReason: setter,
    setHoldReason: setter,
    setHoldUntil: setter,
    setRefundAmount: setter,
    setRefundMethod: setter,
    setRefundPaymentId: setter,
    setRefundReason: setter,
    setReturnLocationId: setter,
    setReturnReason: setter,
    setShippingFee: setter,
    setShippingFeeReason: setter,
    setTrackingCode: setter,
    setTrackingUrl: setter,
  };
}

function actionValues(): OrderActionValues {
  return {
    cancelReason: '',
    carrierName: '',
    cashConfirmed: false,
    codConfirmed: false,
    failureReason: '',
    holdReason: '',
    holdUntil: '',
    refundAmount: '',
    refundMethod: 'BANK_TRANSFER',
    refundPaymentId: '',
    refundReason: '',
    returnLocationId: '',
    returnReason: '',
    shippingFee: '',
    shippingFeeReason: '',
    trackingCode: '',
    trackingUrl: '',
  };
}

function order(overrides: Partial<BackofficeOrderListItem> = {}): BackofficeOrderListItem {
  return {
    availableActions: ['MARK_SHIPMENT_DELIVERED', 'MARK_SHIPMENT_FAILED'],
    balanceDue: '10000000',
    contactEmail: 'khach@example.com',
    contactName: 'Khách Demo',
    firstItemName: 'iPhone 15 Pro',
    fulfillmentStatus: 'IN_TRANSIT',
    fulfillmentType: 'SHIPPING',
    grandTotal: '20000000',
    id: 'order-1',
    location: { code: 'HCM-01', id: 'location-1', name: 'Cửa hàng Hồ Chí Minh', type: 'STORE' },
    orderNumber: 'RPH-20260828-ABC12345',
    paymentStatus: 'PARTIALLY_PAID',
    pickupHoldUntil: null,
    pickupOverdue: false,
    placedAt: '2026-08-28T01:00:00.000Z',
    status: 'PROCESSING',
    totalItemQuantity: 1,
    updatedAt: null,
    ...overrides,
  };
}
