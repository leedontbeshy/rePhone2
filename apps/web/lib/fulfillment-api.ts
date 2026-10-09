import { apiError } from './order-access';
import { safeHttpsUrl } from './safe-https-url';

export type BackofficeOrderStatus =
  'PLACED' | 'CONFIRMED' | 'PROCESSING' | 'COMPLETED' | 'CANCELLED';
export type BackofficeFulfillmentStatus =
  | 'PENDING'
  | 'PREPARING'
  | 'READY'
  | 'IN_TRANSIT'
  | 'COMPLETED'
  | 'FAILED'
  | 'RETURNED'
  | 'CANCELLED';
export type BackofficePaymentStatus =
  'UNPAID' | 'PARTIALLY_PAID' | 'PAID' | 'PARTIALLY_REFUNDED' | 'REFUNDED';
export type FulfillmentAction =
  | 'CONFIRM'
  | 'START_PREPARING'
  | 'MARK_PICKUP_READY'
  | 'EXTEND_PICKUP_HOLD'
  | 'COMPLETE_PICKUP'
  | 'OVERRIDE_SHIPPING_FEE'
  | 'CREATE_SHIPMENT'
  | 'HAND_OVER_SHIPMENT'
  | 'MARK_SHIPMENT_DELIVERED'
  | 'MARK_SHIPMENT_FAILED'
  | 'MARK_SHIPMENT_RETURNED'
  | 'CANCEL_ORDER'
  | 'CREATE_REFUND';
export type PickupOrderAction = FulfillmentAction;

export interface BackofficeOrderLocation {
  id: string;
  code: string;
  name: string;
  type: 'STORE' | 'WAREHOUSE';
}

export interface PickupWarrantySummary {
  warrantyCode: string;
  status: 'ACTIVE' | 'VOIDED';
  startAt: string;
  endAt: string;
}

export interface BackofficeOrderListItem {
  id: string;
  orderNumber: string;
  status: BackofficeOrderStatus;
  fulfillmentStatus: BackofficeFulfillmentStatus;
  paymentStatus: BackofficePaymentStatus;
  fulfillmentType: 'PICKUP' | 'SHIPPING';
  contactName: string;
  contactEmail: string | null;
  firstItemName: string;
  totalItemQuantity: number;
  grandTotal: string;
  balanceDue: string;
  location: BackofficeOrderLocation | null;
  pickupHoldUntil: string | null;
  pickupOverdue: boolean;
  placedAt: string;
  updatedAt: string | null;
  availableActions: FulfillmentAction[];
}

export interface BackofficeOrderItem {
  id: string;
  productName: string;
  variantName: string;
  sku: string;
  inventoryCode: string | null;
  quantity: number;
  unitPrice: string;
  lineTotal: string;
  warrantyDays: number;
  warranty: PickupWarrantySummary | null;
}

export interface BackofficeOrderPayment {
  id: string;
  purpose: 'DEPOSIT' | 'BALANCE' | 'FULL_PAYMENT';
  method: 'BANK_TRANSFER' | 'CASH' | 'COD' | 'OTHER';
  status: string;
  expectedAmount: string;
  receivedAmount: string | null;
  createdAt: string | null;
  reviewedAt: string | null;
}

export interface BackofficeReservationSummary {
  id: string;
  orderItemId: string | null;
  targetType: 'INVENTORY_UNIT' | 'STOCK_LEVEL' | 'UNKNOWN';
  status: string;
  holdReason: string;
  quantity: number;
  expiresAt: string | null;
  releasedAt: string | null;
  consumedAt: string | null;
}

export interface BackofficeOrderShipment {
  id: string;
  orderId: string | null;
  attemptNumber: number;
  carrierName: string;
  trackingCode: string;
  trackingUrl: string | null;
  status: string;
  shippedAt: string | null;
  deliveredAt: string | null;
  failedAt: string | null;
  returnedAt: string | null;
  failureReason: string | null;
  returnedToLocation: BackofficeOrderLocation | null;
  returnNote: string | null;
  createdBy: { id: string; fullName: string; employeeCode: string | null } | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface BackofficeOrderDetail {
  id: string;
  channel?: 'STOREFRONT' | 'DEALER';
  orderNumber: string;
  status: BackofficeOrderStatus;
  fulfillmentStatus: BackofficeFulfillmentStatus;
  paymentStatus: BackofficePaymentStatus;
  fulfillmentType: 'PICKUP' | 'SHIPPING';
  contact: { fullName: string; email: string; phone: string };
  shippingAddress: unknown;
  location: BackofficeOrderLocation | null;
  pickupStore: { code: string; name: string } | null;
  items: BackofficeOrderItem[];
  pricing: {
    subtotal: string;
    voucherDiscountAmount: string;
    shippingFeeOriginal: string;
    shippingFee: string;
    grandTotal: string;
    depositRequired: string;
    paidAmount: string;
    refundedAmount: string;
    balanceDue: string;
    shippingFeeOverride: {
      reason: string;
      overriddenAt: string;
      overriddenBy: { id: string; fullName: string; employeeCode: string | null };
    } | null;
  };
  reservations: BackofficeReservationSummary[];
  paymentAttempts: BackofficeOrderPayment[];
  refundableAmount: string;
  refunds: Array<{
    id: string;
    amount: string;
    method: string;
    status: string;
    reason: string;
    terminalReason: string | null;
    createdAt: string | null;
    completedAt: string | null;
    terminalAt: string | null;
  }>;
  shipments: BackofficeOrderShipment[];
  customerNote: string | null;
  internalNote: string | null;
  placedAt: string;
  confirmedAt: string | null;
  pickupHoldUntil: string | null;
  pickupReadyAt: string | null;
  pickedUpAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  availableActions: FulfillmentAction[];
}

export interface BackofficeOrderListQuery {
  q?: string;
  status?: BackofficeOrderStatus | '';
  fulfillmentStatus?: BackofficeFulfillmentStatus | '';
  paymentStatus?: BackofficePaymentStatus | '';
  fulfillmentType?: 'PICKUP' | 'SHIPPING' | '';
  locationId?: string;
  placedFrom?: string;
  placedTo?: string;
  pickupOverdue?: boolean;
  page: number;
  pageSize: number;
  sortBy: 'placedAt' | 'updatedAt' | 'grandTotal' | 'pickupHoldUntil';
  sortOrder: 'asc' | 'desc';
}

export interface BackofficeOrderListResult {
  data: BackofficeOrderListItem[];
  pagination: { page: number; pageSize: number; totalItems: number; totalPages: number };
}

interface RuntimeApiResult {
  data?: unknown;
  error?: unknown;
}

interface RuntimeApiClient {
  GET(path: string, options?: unknown): Promise<RuntimeApiResult>;
  POST(path: string, options?: unknown): Promise<RuntimeApiResult>;
  PATCH(path: string, options?: unknown): Promise<RuntimeApiResult>;
}

export async function listBackofficeOrders(
  client: unknown,
  query: BackofficeOrderListQuery,
): Promise<BackofficeOrderListResult> {
  const result = await runtimeClient(client).GET('/api/v1/backoffice/orders', {
    params: { query: compactQuery(query) },
  });
  const envelope = responseEnvelope(result, 'Không thể tải danh sách đơn hàng.');
  const rows = Array.isArray(envelope['data']) ? envelope['data'] : [];
  const pagination = recordOrEmpty(recordOrEmpty(envelope['meta'])['pagination']);
  return {
    data: rows.map(parseListItem),
    pagination: {
      page: numberOr(pagination['page'], query.page),
      pageSize: numberOr(pagination['pageSize'], query.pageSize),
      totalItems: numberOr(pagination['totalItems'], rows.length),
      totalPages: numberOr(pagination['totalPages'], rows.length === 0 ? 0 : 1),
    },
  };
}

export async function getBackofficeOrder(
  client: unknown,
  orderId: string,
): Promise<BackofficeOrderDetail> {
  const result = await runtimeClient(client).GET('/api/v1/backoffice/orders/{id}', {
    params: { path: { id: orderId } },
  });
  return parseDetail(responseData(result, 'Không thể tải chi tiết đơn hàng.'));
}

export async function updateBackofficeOrderInternalNote(
  client: unknown,
  orderId: string,
  internalNote: string | null,
): Promise<BackofficeOrderDetail> {
  const result = await runtimeClient(client).PATCH('/api/v1/backoffice/orders/{id}/internal-note', {
    params: { path: { id: orderId } },
    body: { internalNote },
  });
  return parseDetail(responseData(result, 'Không thể lưu ghi chú nội bộ.'));
}

export function confirmPickupOrder(client: unknown, orderId: string) {
  return runOrderCommand(
    client,
    orderId,
    'confirm',
    undefined,
    'Không thể xác nhận đơn nhận tại cửa hàng.',
  );
}

export function startPreparingOrder(client: unknown, orderId: string) {
  return runOrderCommand(
    client,
    orderId,
    'start-preparing',
    undefined,
    'Không thể bắt đầu chuẩn bị hàng.',
  );
}

export function markPickupReady(client: unknown, orderId: string) {
  return runOrderCommand(
    client,
    orderId,
    'mark-pickup-ready',
    undefined,
    'Không thể đánh dấu sẵn sàng nhận hàng.',
  );
}

export function extendPickupHold(
  client: unknown,
  orderId: string,
  input: { holdUntil: string; reason: string },
) {
  return runOrderCommand(
    client,
    orderId,
    'extend-pickup-hold',
    input,
    'Không thể gia hạn giữ hàng.',
  );
}

export function completePickup(
  client: unknown,
  orderId: string,
  input: { confirmCashCollected: boolean },
) {
  return runOrderCommand(
    client,
    orderId,
    'complete-pickup',
    input,
    'Không thể hoàn tất giao hàng tại cửa hàng.',
  );
}

export function overrideShippingFee(
  client: unknown,
  orderId: string,
  input: { shippingFee: string; reason: string },
) {
  return runOrderCommand(
    client,
    orderId,
    'override-shipping-fee',
    input,
    'Không thể cập nhật phí giao hàng.',
  );
}

export function cancelBackofficeOrder(client: unknown, orderId: string, reason: string) {
  return runOrderCommand(client, orderId, 'cancel', { reason }, 'Không thể hủy đơn hàng.');
}

export async function createShipment(
  client: unknown,
  orderId: string,
  input: { carrierName: string; trackingCode: string; trackingUrl?: string },
): Promise<BackofficeOrderShipment> {
  const result = await runtimeClient(client).POST('/api/v1/backoffice/orders/{id}/shipment', {
    params: { path: { id: orderId } },
    body: input,
  });
  return parseShipment(responseData(result, 'Không thể tạo vận đơn.'));
}

export function handOverShipment(client: unknown, shipmentId: string) {
  return runShipmentCommand(client, shipmentId, 'hand-over', undefined, 'Không thể bàn giao hàng.');
}

export function markShipmentDelivered(
  client: unknown,
  shipmentId: string,
  input: { confirmCodCollected: boolean },
) {
  return runShipmentCommand(
    client,
    shipmentId,
    'mark-delivered',
    input,
    'Không thể xác nhận giao hàng.',
  );
}

export function markShipmentFailed(client: unknown, shipmentId: string, input: { reason: string }) {
  return runShipmentCommand(
    client,
    shipmentId,
    'mark-failed',
    input,
    'Không thể ghi nhận giao hàng thất bại.',
  );
}

export function markShipmentReturned(
  client: unknown,
  shipmentId: string,
  input: { returnedToLocationId: string; reason: string },
) {
  return runShipmentCommand(
    client,
    shipmentId,
    'mark-returned',
    input,
    'Không thể ghi nhận hàng hoàn về.',
  );
}

export async function listActiveReturnLocations(
  client: unknown,
): Promise<BackofficeOrderLocation[]> {
  const result = await runtimeClient(client).GET('/api/v1/backoffice/inventory-locations');
  const data = responseData(result, 'Không thể tải danh sách địa điểm nhận hàng hoàn.');
  if (!Array.isArray(data)) return [];
  return data
    .filter((value) => recordOrEmpty(value)['status'] === 'ACTIVE')
    .map(parseLocation)
    .filter((location): location is BackofficeOrderLocation => location !== null);
}

export function fulfillmentError(value: unknown, fallback: string): string {
  if (value instanceof Error) return value.message;
  const code = errorCode(value);
  if (code === 'INVALID_STATE_TRANSITION') {
    return 'Đơn hàng không còn ở trạng thái cho phép thao tác này. Hãy tải lại.';
  }
  if (code === 'ORDER_NOT_FULLY_PAID') {
    return 'Đơn chưa được xác nhận thu đủ số tiền còn lại.';
  }
  if (code === 'INVENTORY_NOT_AVAILABLE') {
    return 'Phần hàng đang giữ hoặc tồn kho của đơn không còn hợp lệ.';
  }
  if (code === 'RESERVATION_EXPIRED') {
    return 'Đã hết hạn giữ hàng. Hãy tải lại để xem trạng thái mới nhất.';
  }
  if (code === 'CONCURRENT_MODIFICATION') {
    return 'Đơn vừa được xử lý ở phiên khác. Hãy tải lại.';
  }
  if (code === 'RESOURCE_NOT_FOUND') return 'Không tìm thấy đơn hàng.';
  if (code === 'RATE_LIMITED') return 'Bạn thao tác quá nhanh. Vui lòng thử lại sau.';
  return apiError(value, fallback);
}

async function runOrderCommand(
  client: unknown,
  orderId: string,
  command:
    | 'confirm'
    | 'start-preparing'
    | 'mark-pickup-ready'
    | 'extend-pickup-hold'
    | 'complete-pickup'
    | 'override-shipping-fee'
    | 'cancel',
  body: unknown,
  fallback: string,
): Promise<BackofficeOrderDetail> {
  const result = await runtimeClient(client).POST(`/api/v1/backoffice/orders/{id}/${command}`, {
    params: { path: { id: orderId } },
    ...(body === undefined ? {} : { body }),
  });
  return parseDetail(responseData(result, fallback));
}

async function runShipmentCommand(
  client: unknown,
  shipmentId: string,
  command: 'hand-over' | 'mark-delivered' | 'mark-failed' | 'mark-returned',
  body: unknown,
  fallback: string,
): Promise<BackofficeOrderDetail> {
  const result = await runtimeClient(client).POST(`/api/v1/backoffice/shipments/{id}/${command}`, {
    params: { path: { id: shipmentId } },
    ...(body === undefined ? {} : { body }),
  });
  return parseDetail(responseData(result, fallback));
}

function parseListItem(value: unknown): BackofficeOrderListItem {
  const input = recordOrThrow(value, 'Dữ liệu đơn hàng không hợp lệ.');
  const contact = recordOrEmpty(input['contact']);
  const pickup = recordOrEmpty(input['pickup']);
  const items = Array.isArray(input['items']) ? input['items'].map(recordOrEmpty) : [];
  const firstItem = items[0];
  return {
    id: stringOr(input['id']),
    orderNumber: stringOr(input['orderNumber']),
    status: orderStatus(input['status']),
    fulfillmentStatus: fulfillmentStatus(input['fulfillmentStatus']),
    paymentStatus: paymentStatus(input['paymentStatus']),
    fulfillmentType: fulfillmentType(input['fulfillmentType']),
    contactName:
      stringOrNull(input['customerName']) ?? stringOrNull(contact['fullName']) ?? 'Khách hàng',
    contactEmail: stringOrNull(input['customerEmail']) ?? stringOrNull(contact['email']),
    firstItemName:
      (stringOrNull(input['firstItemName']) ??
        (firstItem === undefined ? 'Đơn hàng' : stringOr(firstItem['productName']))) ||
      'Đơn hàng',
    totalItemQuantity:
      numberOrNull(input['totalItemQuantity']) ??
      items.reduce((sum, item) => sum + numberOr(item['quantity'], 0), 0),
    grandTotal: requiredMoney(input['grandTotal'], 'Tổng tiền'),
    balanceDue: requiredMoney(input['balanceDue'], 'Số tiền còn phải thu'),
    location: parseLocation(input['location']),
    pickupHoldUntil: stringOrNull(input['pickupHoldUntil']) ?? stringOrNull(pickup['holdUntil']),
    pickupOverdue: input['pickupOverdue'] === true,
    placedAt: stringOr(input['placedAt']),
    updatedAt: stringOrNull(input['updatedAt']),
    availableActions: fulfillmentActions(input['availableActions']),
  };
}

function parseDetail(value: unknown): BackofficeOrderDetail {
  const input = recordOrThrow(value, 'Dữ liệu chi tiết đơn hàng không hợp lệ.');
  const contact = recordOrEmpty(input['contact']);
  const pricing = recordOrThrow(input['pricing'], 'Dữ liệu tài chính của đơn hàng không hợp lệ.');
  const pickup = recordOrEmpty(input['pickup']);
  const orderFulfillmentType = fulfillmentType(input['fulfillmentType']);
  const location = parseLocation(input['location']);
  const pickupStore = recordOrEmpty(
    input['pickupStore'] ??
      input['pickupLocation'] ??
      pickup['location'] ??
      (orderFulfillmentType === 'PICKUP' ? input['location'] : undefined),
  );
  const items = Array.isArray(input['items']) ? input['items'] : [];
  const reservations = Array.isArray(input['reservations']) ? input['reservations'] : [];
  const payments = Array.isArray(input['paymentAttempts'])
    ? input['paymentAttempts']
    : Array.isArray(input['payments'])
      ? input['payments']
      : [];
  const refunds = Array.isArray(input['refunds']) ? input['refunds'] : [];
  const shipments = Array.isArray(input['shipments']) ? input['shipments'] : [];
  const warranties = Array.isArray(input['warranties']) ? input['warranties'] : [];
  const warrantyByOrderItem = new Map<string, Record<string, unknown>>();
  for (const row of warranties) {
    const warranty = recordOrEmpty(row);
    const orderItemId = stringOrNull(warranty['orderItemId']);
    if (orderItemId !== null) warrantyByOrderItem.set(orderItemId, warranty);
  }
  return {
    id: stringOr(input['id']),
    orderNumber: stringOr(input['orderNumber']),
    status: orderStatus(input['status']),
    fulfillmentStatus: fulfillmentStatus(input['fulfillmentStatus']),
    paymentStatus: paymentStatus(input['paymentStatus']),
    fulfillmentType: orderFulfillmentType,
    channel: input['channel'] === 'DEALER' ? 'DEALER' : 'STOREFRONT',
    contact: {
      fullName: stringOrNull(contact['fullName']) ?? stringOr(input['customerName']),
      email: stringOrNull(contact['email']) ?? stringOr(input['customerEmail']),
      phone: stringOrNull(contact['phone']) ?? stringOr(input['customerPhone']),
    },
    shippingAddress: input['shippingAddress'] ?? null,
    location,
    pickupStore:
      orderFulfillmentType !== 'PICKUP' || stringOrNull(pickupStore['name']) === null
        ? null
        : { code: stringOr(pickupStore['code']), name: stringOr(pickupStore['name']) },
    items: items.map((row) => {
      const item = recordOrEmpty(row);
      const orderItemId = stringOr(item['id']);
      return parseOrderItem({
        ...item,
        warranty: item['warranty'] ?? warrantyByOrderItem.get(orderItemId),
      });
    }),
    pricing: {
      subtotal: requiredMoney(pricing['subtotal'], 'Tạm tính'),
      voucherDiscountAmount: requiredMoney(pricing['voucherDiscountAmount'], 'Số tiền giảm giá'),
      shippingFeeOriginal: requiredMoney(pricing['shippingFeeOriginal'], 'Phí giao hàng ban đầu'),
      shippingFee: requiredMoney(pricing['shippingFee'], 'Phí giao hàng'),
      grandTotal: requiredMoney(pricing['grandTotal'], 'Tổng tiền'),
      depositRequired: requiredMoney(pricing['depositRequired'], 'Tiền cọc'),
      paidAmount: requiredMoney(pricing['paidAmount'], 'Số tiền đã thu'),
      refundedAmount: requiredMoney(pricing['refundedAmount'], 'Số tiền đã hoàn'),
      balanceDue: requiredMoney(pricing['balanceDue'], 'Số tiền còn phải thu'),
      shippingFeeOverride: parseShippingFeeOverride(
        input['shippingFeeOverride'] ?? pricing['shippingFeeOverride'],
      ),
    },
    reservations: reservations.map((row) => {
      const reservation = recordOrEmpty(row);
      return {
        id: stringOr(reservation['id']),
        orderItemId: stringOrNull(reservation['orderItemId']),
        targetType:
          reservation['targetType'] === 'INVENTORY_UNIT' ||
          reservation['targetType'] === 'STOCK_LEVEL'
            ? reservation['targetType']
            : 'UNKNOWN',
        status: stringOr(reservation['status']),
        holdReason: stringOr(reservation['holdReason']),
        quantity: numberOr(reservation['quantity'], 0),
        expiresAt: stringOrNull(reservation['expiresAt']),
        releasedAt: stringOrNull(reservation['releasedAt']),
        consumedAt: stringOrNull(reservation['consumedAt']),
      };
    }),
    paymentAttempts: payments.map(parsePayment),
    refundableAmount: requiredMoney(input['refundableAmount'], 'Số tiền còn có thể hoàn'),
    refunds: refunds.map((row) => {
      const refund = recordOrEmpty(row);
      return {
        id: stringOr(refund['id']),
        amount: moneyOrZero(refund['amount']),
        method: stringOr(refund['method']),
        status: stringOr(refund['status']),
        reason: stringOr(refund['reason']),
        terminalReason: stringOrNull(refund['terminalReason']),
        createdAt: stringOrNull(refund['createdAt']),
        completedAt: stringOrNull(refund['completedAt']),
        terminalAt: stringOrNull(refund['terminalAt']),
      };
    }),
    shipments: shipments.map(parseShipment),
    customerNote: stringOrNull(input['customerNote']),
    internalNote: stringOrNull(input['internalNote']),
    placedAt: stringOr(input['placedAt']),
    confirmedAt: stringOrNull(input['confirmedAt']),
    pickupHoldUntil: stringOrNull(input['pickupHoldUntil']) ?? stringOrNull(pickup['holdUntil']),
    pickupReadyAt: stringOrNull(input['pickupReadyAt']) ?? stringOrNull(pickup['readyAt']),
    pickedUpAt: stringOrNull(input['pickedUpAt']) ?? stringOrNull(pickup['pickedUpAt']),
    completedAt: stringOrNull(input['completedAt']),
    cancelledAt: stringOrNull(input['cancelledAt']),
    cancelReason: stringOrNull(input['cancelReason']),
    availableActions: fulfillmentActions(input['availableActions']),
  };
}

function parseShipment(value: unknown): BackofficeOrderShipment {
  const shipment = recordOrEmpty(value);
  return {
    id: stringOr(shipment['id']),
    orderId: stringOrNull(shipment['orderId']),
    attemptNumber: numberOr(shipment['attemptNumber'], 0),
    carrierName: stringOr(shipment['carrierName']),
    trackingCode: stringOr(shipment['trackingCode']),
    trackingUrl: safeHttpsUrl(stringOrNull(shipment['trackingUrl'])),
    status: stringOr(shipment['status']),
    shippedAt: stringOrNull(shipment['shippedAt']),
    deliveredAt: stringOrNull(shipment['deliveredAt']),
    failedAt: stringOrNull(shipment['failedAt']),
    returnedAt: stringOrNull(shipment['returnedAt']),
    failureReason: stringOrNull(shipment['failureReason']),
    returnedToLocation: parseLocation(shipment['returnedToLocation']),
    returnNote: stringOrNull(shipment['returnNote']),
    createdBy: parseActor(shipment['createdBy']),
    createdAt: stringOrNull(shipment['createdAt']),
    updatedAt: stringOrNull(shipment['updatedAt']),
  };
}

function parseShippingFeeOverride(
  value: unknown,
): BackofficeOrderDetail['pricing']['shippingFeeOverride'] {
  const override = recordOrEmpty(value);
  const reason = stringOrNull(override['reason']);
  const overriddenAt = stringOrNull(override['overriddenAt']);
  const overriddenBy = parseActor(override['overriddenBy']);
  if (reason === null || overriddenAt === null || overriddenBy === null) return null;
  return { reason, overriddenAt, overriddenBy };
}

function parseLocation(value: unknown): BackofficeOrderLocation | null {
  const location = recordOrEmpty(value);
  const id = stringOrNull(location['id']);
  const name = stringOrNull(location['name']);
  if (id === null || name === null) return null;
  return {
    id,
    code: stringOr(location['code']),
    name,
    type: location['type'] === 'WAREHOUSE' ? 'WAREHOUSE' : 'STORE',
  };
}

function parseActor(
  value: unknown,
): { id: string; fullName: string; employeeCode: string | null } | null {
  const actor = recordOrEmpty(value);
  const id = stringOrNull(actor['id']);
  const fullName = stringOrNull(actor['fullName']);
  if (id === null || fullName === null) return null;
  return { id, fullName, employeeCode: stringOrNull(actor['employeeCode']) };
}

function parseOrderItem(value: unknown): BackofficeOrderItem {
  const item = recordOrEmpty(value);
  const warranty = recordOrEmpty(item['warranty']);
  const warrantyCode = stringOrNull(warranty['warrantyCode']);
  return {
    id: stringOr(item['id']),
    productName: stringOr(item['productName']),
    variantName: stringOr(item['variantName']),
    sku: stringOr(item['sku']),
    inventoryCode: stringOrNull(item['inventoryCode']),
    quantity: numberOr(item['quantity'], 0),
    unitPrice: moneyOrZero(item['unitPrice']),
    lineTotal: moneyOrZero(item['lineTotal']),
    warrantyDays: numberOr(item['warrantyDays'], 0),
    warranty:
      warrantyCode === null
        ? null
        : {
            warrantyCode,
            status: warranty['status'] === 'VOIDED' ? 'VOIDED' : 'ACTIVE',
            startAt: stringOr(warranty['startAt']),
            endAt: stringOr(warranty['endAt']),
          },
  };
}

function parsePayment(value: unknown): BackofficeOrderPayment {
  const payment = recordOrEmpty(value);
  return {
    id: stringOr(payment['id']),
    purpose:
      payment['purpose'] === 'BALANCE' || payment['purpose'] === 'FULL_PAYMENT'
        ? payment['purpose']
        : 'DEPOSIT',
    method:
      payment['method'] === 'CASH' || payment['method'] === 'COD' || payment['method'] === 'OTHER'
        ? payment['method']
        : 'BANK_TRANSFER',
    status: stringOr(payment['status']),
    expectedAmount: moneyOrZero(payment['expectedAmount']),
    receivedAmount: moneyOrNull(payment['receivedAmount']),
    createdAt: stringOrNull(payment['createdAt']),
    reviewedAt: stringOrNull(payment['reviewedAt']),
  };
}

function fulfillmentActions(value: unknown): FulfillmentAction[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isFulfillmentAction);
}

function isFulfillmentAction(value: unknown): value is FulfillmentAction {
  return (
    value === 'CONFIRM' ||
    value === 'START_PREPARING' ||
    value === 'MARK_PICKUP_READY' ||
    value === 'EXTEND_PICKUP_HOLD' ||
    value === 'COMPLETE_PICKUP' ||
    value === 'OVERRIDE_SHIPPING_FEE' ||
    value === 'CREATE_SHIPMENT' ||
    value === 'HAND_OVER_SHIPMENT' ||
    value === 'MARK_SHIPMENT_DELIVERED' ||
    value === 'MARK_SHIPMENT_FAILED' ||
    value === 'MARK_SHIPMENT_RETURNED' ||
    value === 'CANCEL_ORDER' ||
    value === 'CREATE_REFUND'
  );
}

function compactQuery(query: BackofficeOrderListQuery): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(query).filter(([, value]) => value !== '' && value !== undefined),
  );
}

function responseData(result: RuntimeApiResult, fallback: string): unknown {
  const envelope = responseEnvelope(result, fallback);
  if (!('data' in envelope)) throw new Error(fallback);
  return envelope['data'];
}

function responseEnvelope(result: RuntimeApiResult, fallback: string): Record<string, unknown> {
  if (result.data === undefined) throw new Error(fulfillmentError(result.error, fallback));
  return recordOrThrow(result.data, fallback);
}

function runtimeClient(client: unknown): RuntimeApiClient {
  return client as RuntimeApiClient;
}

function errorCode(value: unknown): string | undefined {
  return isRecord(value) && isRecord(value['error']) && typeof value['error']['code'] === 'string'
    ? value['error']['code']
    : undefined;
}

function requiredMoney(value: unknown, label: string): string {
  const money = moneyOrNull(value);
  if (money === null) throw new Error(`${label} trong phản hồi đơn hàng không hợp lệ.`);
  return money;
}

function moneyOrNull(value: unknown): string | null {
  return typeof value === 'string' && /^\d+$/.test(value) ? value : null;
}

function moneyOrZero(value: unknown): string {
  return moneyOrNull(value) ?? '0';
}

function stringOr(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function orderStatus(value: unknown): BackofficeOrderStatus {
  if (
    value === 'CONFIRMED' ||
    value === 'PROCESSING' ||
    value === 'COMPLETED' ||
    value === 'CANCELLED'
  ) {
    return value;
  }
  if (value === 'PLACED') return value;
  throw new Error('Trạng thái đơn hàng trong phản hồi không hợp lệ.');
}

function fulfillmentStatus(value: unknown): BackofficeFulfillmentStatus {
  if (
    value === 'PREPARING' ||
    value === 'READY' ||
    value === 'IN_TRANSIT' ||
    value === 'COMPLETED' ||
    value === 'FAILED' ||
    value === 'RETURNED' ||
    value === 'CANCELLED'
  ) {
    return value;
  }
  if (value === 'PENDING') return value;
  throw new Error('Tình trạng giao nhận trong phản hồi không hợp lệ.');
}

function paymentStatus(value: unknown): BackofficePaymentStatus {
  if (
    value === 'PARTIALLY_PAID' ||
    value === 'PAID' ||
    value === 'PARTIALLY_REFUNDED' ||
    value === 'REFUNDED'
  ) {
    return value;
  }
  if (value === 'UNPAID') return value;
  throw new Error('Tình trạng thanh toán trong phản hồi không hợp lệ.');
}

function fulfillmentType(value: unknown): 'PICKUP' | 'SHIPPING' {
  if (value === 'PICKUP' || value === 'SHIPPING') return value;
  throw new Error('Cách nhận hàng trong phản hồi không hợp lệ.');
}

function recordOrEmpty(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function recordOrThrow(value: unknown, message: string): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(message);
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
