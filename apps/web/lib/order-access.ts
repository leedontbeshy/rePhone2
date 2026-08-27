const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function orderTokenStorageKey(orderNumber: string): string {
  return `rephone_order_token:${orderNumber}`;
}

export function captureGuestOrderToken(
  orderNumber: string,
  hash: string,
  storage: Pick<Storage, 'getItem' | 'setItem'>,
): string | undefined {
  const token = new URLSearchParams(hash.replace(/^#/, '')).get('token') ?? undefined;
  if (token !== undefined && TOKEN_PATTERN.test(token)) {
    storage.setItem(orderTokenStorageKey(orderNumber), token);
    return token;
  }
  const stored = storage.getItem(orderTokenStorageKey(orderNumber)) ?? undefined;
  return stored !== undefined && TOKEN_PATTERN.test(stored) ? stored : undefined;
}

export function apiError(value: unknown, fallback: string): string {
  if (
    isRecord(value) &&
    isRecord(value['error']) &&
    typeof value['error']['message'] === 'string'
  ) {
    return value['error']['message'];
  }
  return fallback;
}

export function customerApiError(value: unknown, fallback: string): string {
  if (!isRecord(value) || !isRecord(value['error'])) return fallback;
  const code = typeof value['error']['code'] === 'string' ? value['error']['code'] : undefined;
  return code === undefined ? fallback : (CUSTOMER_ORDER_ERROR_MESSAGES[code] ?? fallback);
}

const CUSTOMER_ORDER_ERROR_MESSAGES: Readonly<Record<string, string>> = {
  VALIDATION_FAILED: 'Thông tin chưa hợp lệ. Hãy kiểm tra lại các mục đã nhập.',
  AUTH_REQUIRED: 'Bạn cần đăng nhập hoặc mở đúng liên kết đơn hàng đã nhận.',
  ACCESS_TOKEN_INVALID: 'Liên kết này không còn dùng được. Hãy đăng nhập để tiếp tục.',
  SESSION_REVOKED: 'Bạn đã đăng xuất. Hãy đăng nhập lại để tiếp tục.',
  ACCOUNT_UNAVAILABLE: 'Tài khoản hiện không thể thực hiện thao tác này.',
  FORBIDDEN: 'Bạn không có quyền thực hiện thao tác này.',
  CSRF_VALIDATION_FAILED: 'Không thể xác nhận yêu cầu. Hãy tải lại trang rồi thử lại.',
  RESOURCE_NOT_FOUND: 'Không tìm thấy thông tin bạn đang cần.',
  ORDER_NOT_FOUND: 'Không tìm thấy đơn hàng này.',
  INVALID_STATE_TRANSITION: 'Thao tác này không còn phù hợp với trạng thái hiện tại.',
  RESERVATION_EXPIRED: 'Thời gian giữ hàng đã hết. Hãy kiểm tra lại giỏ hàng.',
  CONCURRENT_MODIFICATION: 'Thông tin vừa thay đổi. Hãy tải lại trang rồi thử lại.',
  INVENTORY_NOT_AVAILABLE: 'Sản phẩm này hiện không còn sẵn hàng.',
  INVENTORY_INSPECTION_REQUIRED: 'Sản phẩm này đang được kiểm tra và chưa thể đặt hàng.',
  INVENTORY_AVAILABILITY_REQUIREMENTS_NOT_MET: 'Sản phẩm này hiện chưa thể đặt hàng.',
  CART_NOT_ACTIVE: 'Giỏ hàng này không còn hoạt động. Hãy tạo giỏ hàng mới.',
  CART_EMPTY: 'Giỏ hàng đang trống.',
  CART_NOT_FULFILLABLE: 'Cửa hàng chưa thể chuẩn bị toàn bộ sản phẩm trong giỏ.',
  CART_ITEM_QUANTITY_FIXED: 'Số lượng của sản phẩm này không thể thay đổi.',
  CHECKOUT_REVIEW_REQUIRED: 'Giỏ hàng vừa thay đổi. Hãy kiểm tra lại trước khi xác nhận.',
  PAYMENT_PROOF_DEADLINE_PASSED: 'Đã hết thời gian gửi minh chứng thanh toán.',
  VOUCHER_NOT_APPLICABLE: 'Mã ưu đãi chưa áp dụng được cho giỏ hàng này.',
  VOUCHER_USAGE_LIMIT_REACHED: 'Mã ưu đãi đã hết lượt sử dụng.',
  RATE_LIMITED: 'Bạn đã thao tác quá nhiều lần. Vui lòng thử lại sau.',
  SERVICE_UNAVAILABLE: 'Dịch vụ đang tạm gián đoạn. Vui lòng thử lại sau.',
  STORAGE_UNAVAILABLE: 'Hiện chưa thể lưu tệp. Vui lòng thử lại sau.',
  INTERNAL_ERROR: 'Hệ thống chưa thể xử lý yêu cầu. Vui lòng thử lại.',
};

export function checkoutChangedPreview(value: unknown): unknown {
  if (
    !isRecord(value) ||
    !isRecord(value['error']) ||
    value['error']['code'] !== 'CHECKOUT_REVIEW_REQUIRED'
  ) {
    return undefined;
  }
  const details: unknown = value['error']['details'];
  if (!Array.isArray(details)) return undefined;
  const detail: unknown = (details as unknown[]).find(
    (candidate) => isRecord(candidate) && candidate['code'] === 'CHECKOUT_CHANGED',
  );
  return isRecord(detail) ? detail['current'] : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
