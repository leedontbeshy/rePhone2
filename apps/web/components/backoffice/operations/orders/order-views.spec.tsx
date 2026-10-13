import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { BackofficeOrderDetail, BackofficeOrderListItem } from '@/lib/fulfillment-api';
import { OrderActionChoices, OrderActionPanel } from './order-action-panel';
import type { OrderActionSetters, OrderActionValues } from './order-action-fields';
import { OrderDetailView } from './order-detail-view';
import { OrderDetailMain, OrderNoteForm } from './order-detail-sections';
import { OrderFinancialSummary, OrderSummaryBand } from './order-detail-summary';
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

  it('keeps existing queue rows visible while a URL-driven refresh is loading', () => {
    const markup = renderToStaticMarkup(<OrderQueue orders={[order()]} updating />);

    expect(markup).toContain('aria-busy="true"');
    expect(markup).toContain('RPH-20260828-ABC12345');
    expect(markup).toContain('Khách Demo');
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
    expect(actionMarkup).toContain('<details');
    expect(actionMarkup).toContain('Chi tiết bàn giao cho đơn vị vận chuyển');
    expect(actionMarkup).not.toMatch(/<details[^>]*\sopen(?:=|\s|>)/);
  });

  it('shows a loading state instead of a false not-found message before the first response', () => {
    const markup = renderToStaticMarkup(<OrderDetailView orderId="order-1" />);

    expect(markup).toContain('Đang tải chi tiết đơn hàng');
    expect(markup).not.toContain('Không tìm thấy đơn hàng');
  });

  it('renders a compact authoritative summary without raw status values', () => {
    const markup = renderToStaticMarkup(<OrderSummaryBand detail={orderDetail()} />);

    expect(markup).toContain('RPH-20260828-ABC12345');
    expect(markup).toContain('Khách Demo');
    expect(markup).toContain('0900000000');
    expect(markup).toContain('1.500.000');
    expect(markup).toContain('Giao tận nơi');
    expect(markup).toContain('Trạng thái đơn');
    expect(markup).toContain('Trạng thái giao hàng');
    expect(markup).toContain('Trạng thái thanh toán');
    expect(markup).not.toContain('PROCESSING');
    expect(markup).not.toContain('IN_TRANSIT');
    expect(markup).not.toContain('PARTIALLY_PAID');
  });

  it('puts products before customer details and keeps the timeline semantic', () => {
    const markup = renderToStaticMarkup(
      <OrderDetailMain
        detail={orderDetail()}
        internalNote=""
        notePending={false}
        writesDisabled={false}
        setInternalNote={() => undefined}
        onSaveNote={() => undefined}
      />,
    );

    expect(markup.indexOf('Sản phẩm')).toBeLessThan(markup.indexOf('Khách hàng và giao nhận'));
    expect(markup).toContain('aria-label="Tiến trình đơn hàng"');
    expect(markup).toContain('<ol');
    expect(markup).toContain('iPhone 15 Pro');
    expect(markup).not.toContain('<img');
  });

  it('separates order value from collected and refundable money', () => {
    const markup = renderToStaticMarkup(<OrderFinancialSummary detail={orderDetail()} />);

    expect(markup).toContain('Tổng quan tài chính');
    expect(markup).toContain('Giá trị đơn');
    expect(markup).toContain('Dòng tiền');
    expect(markup).toContain('Phí giao hàng');
    expect(markup).toContain('Còn phải thu');
    expect(markup).toContain('Còn có thể hoàn');
  });

  it('shows current costs with their source to admins but hides retained cost data for employees', () => {
    const detail = orderDetail();
    detail.currentCostSummary = {
      source: 'CURRENT_INVENTORY',
      knownCost: '9187500',
      totalCost: '9187500',
      missingQuantity: 0,
    };
    const rows = [order({ currentCostSummary: detail.currentCostSummary })];
    const adminList = renderToStaticMarkup(<OrderQueue orders={rows} showCosts />);
    const adminDetail = renderToStaticMarkup(<OrderFinancialSummary detail={detail} showCosts />);
    expect(adminList).toContain('Giá vốn đang lưu');
    expect(adminList).toContain('9.187.500');
    expect(adminDetail).toContain('9.187.500');
    for (const markup of [adminList, adminDetail])
      expect(markup).toContain('có thể khác thời điểm bán');
    for (const markup of [
      renderToStaticMarkup(<OrderQueue orders={rows} />),
      renderToStaticMarkup(<OrderFinancialSummary detail={detail} />),
    ]) {
      expect(markup).not.toContain('9.187.500');
      expect(markup).not.toContain('Giá vốn đang lưu');
    }
  });

  it('labels partial costs as incomplete without replacing the missing total with zero', () => {
    const detail = orderDetail();
    detail.currentCostSummary = {
      source: 'CURRENT_INVENTORY',
      knownCost: '9187500',
      totalCost: null,
      missingQuantity: 2,
    };
    const markup = renderToStaticMarkup(<OrderFinancialSummary detail={detail} showCosts />);
    expect(markup).toContain('Chưa đủ dữ liệu');
    expect(markup).toContain('9.187.500');
    expect(markup).toContain('2 sản phẩm chưa có giá vốn');
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

function orderDetail(): BackofficeOrderDetail {
  return {
    availableActions: ['MARK_SHIPMENT_DELIVERED', 'MARK_SHIPMENT_FAILED'],
    cancelReason: null,
    cancelledAt: null,
    completedAt: null,
    confirmedAt: '2026-08-28T02:00:00.000Z',
    contact: { email: 'khach@example.com', fullName: 'Khách Demo', phone: '0900000000' },
    customerNote: null,
    fulfillmentStatus: 'IN_TRANSIT',
    fulfillmentType: 'SHIPPING',
    id: 'order-1',
    internalNote: null,
    items: [
      {
        id: 'item-1',
        inventoryCode: 'RPH-U-DEMO',
        lineTotal: '1470000',
        productName: 'iPhone 15 Pro',
        quantity: 1,
        sku: 'IP15P-128-BLU',
        unitPrice: '1470000',
        variantName: '128 GB Blue',
        warranty: null,
        warrantyDays: 90,
      },
    ],
    location: { code: 'HCM-01', id: 'location-1', name: 'Cửa hàng Hồ Chí Minh', type: 'STORE' },
    orderNumber: 'RPH-20260828-ABC12345',
    paymentAttempts: [],
    paymentStatus: 'PARTIALLY_PAID',
    pickedUpAt: null,
    pickupHoldUntil: null,
    pickupReadyAt: null,
    pickupStore: null,
    placedAt: '2026-08-28T01:00:00.000Z',
    pricing: {
      balanceDue: '1000000',
      depositRequired: '500000',
      grandTotal: '1500000',
      paidAmount: '500000',
      refundedAmount: '0',
      shippingFee: '30000',
      shippingFeeOriginal: '30000',
      shippingFeeOverride: null,
      subtotal: '1470000',
      voucherDiscountAmount: '0',
    },
    refundableAmount: '500000',
    refunds: [],
    reservations: [],
    shipments: [],
    shippingAddress: {
      addressLine1: '116 Lý Chiêu Hoàng',
      city: 'Thành phố Hồ Chí Minh',
      district: 'Quận 6',
      ward: 'Phường 10',
    },
    status: 'PROCESSING',
  };
}
