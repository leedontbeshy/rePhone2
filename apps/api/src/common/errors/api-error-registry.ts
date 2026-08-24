import { HttpStatus } from '@nestjs/common';
import type { ApiErrorCode } from './api-error.js';

export interface ApiErrorDefinition {
  status: number;
  message: string;
}

export const API_ERROR_REGISTRY: Record<ApiErrorCode, ApiErrorDefinition> = {
  VALIDATION_FAILED: {
    status: HttpStatus.BAD_REQUEST,
    message: 'Dữ liệu yêu cầu không hợp lệ.',
  },
  MALFORMED_JSON: {
    status: HttpStatus.BAD_REQUEST,
    message: 'Nội dung JSON không hợp lệ.',
  },
  AUTH_REQUIRED: {
    status: HttpStatus.UNAUTHORIZED,
    message: 'Yêu cầu xác thực.',
  },
  ACCESS_TOKEN_INVALID: {
    status: HttpStatus.UNAUTHORIZED,
    message: 'Access token không hợp lệ hoặc đã hết hạn.',
  },
  INVALID_CREDENTIALS: {
    status: HttpStatus.UNAUTHORIZED,
    message: 'Email hoặc mật khẩu không đúng.',
  },
  SESSION_REVOKED: {
    status: HttpStatus.UNAUTHORIZED,
    message: 'Phiên đăng nhập không còn hiệu lực.',
  },
  ACCOUNT_UNAVAILABLE: {
    status: HttpStatus.FORBIDDEN,
    message: 'Tài khoản hiện không khả dụng.',
  },
  FORBIDDEN: {
    status: HttpStatus.FORBIDDEN,
    message: 'Bạn không có quyền thực hiện thao tác này.',
  },
  CSRF_VALIDATION_FAILED: {
    status: HttpStatus.FORBIDDEN,
    message: 'Yêu cầu không vượt qua kiểm tra CSRF.',
  },
  RESOURCE_NOT_FOUND: {
    status: HttpStatus.NOT_FOUND,
    message: 'Không tìm thấy tài nguyên.',
  },
  FILE_TOO_LARGE: {
    status: HttpStatus.PAYLOAD_TOO_LARGE,
    message: 'Tệp tải lên vượt quá giới hạn cho phép.',
  },
  UNSUPPORTED_FILE_TYPE: {
    status: HttpStatus.UNSUPPORTED_MEDIA_TYPE,
    message: 'Định dạng tệp không được hỗ trợ.',
  },
  DUPLICATE_RESOURCE: {
    status: HttpStatus.CONFLICT,
    message: 'Tài nguyên đã tồn tại.',
  },
  INVALID_STATE_TRANSITION: {
    status: HttpStatus.CONFLICT,
    message: 'Tài nguyên không còn ở trạng thái cho phép thao tác này.',
  },
  CONCURRENT_MODIFICATION: {
    status: HttpStatus.CONFLICT,
    message: 'Dữ liệu đã được thay đổi đồng thời. Vui lòng thử lại.',
  },
  INVENTORY_NOT_AVAILABLE: {
    status: HttpStatus.CONFLICT,
    message: 'Tồn kho không còn khả dụng.',
  },
  INVENTORY_INSPECTION_REQUIRED: {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    message: 'Thiết bị chưa có kết quả kiểm định đạt yêu cầu.',
  },
  INVENTORY_AVAILABILITY_REQUIREMENTS_NOT_MET: {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    message: 'Thiết bị chưa đáp ứng đủ điều kiện để mở bán.',
  },
  CART_NOT_ACTIVE: {
    status: HttpStatus.CONFLICT,
    message: 'Giỏ hàng không còn ở trạng thái hoạt động.',
  },
  CART_EMPTY: {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    message: 'Giỏ hàng đang trống.',
  },
  CART_NOT_FULFILLABLE: {
    status: HttpStatus.CONFLICT,
    message: 'Không có địa điểm nào có thể cấp đủ toàn bộ giỏ hàng.',
  },
  CART_ITEM_QUANTITY_FIXED: {
    status: HttpStatus.CONFLICT,
    message: 'Số lượng thiết bị định danh luôn là một.',
  },
  CHECKOUT_REVIEW_REQUIRED: {
    status: HttpStatus.CONFLICT,
    message: 'Giỏ hàng hoặc tổng tiền đã thay đổi. Vui lòng xác nhận lại.',
  },
  ORDER_NOT_FOUND: {
    status: HttpStatus.NOT_FOUND,
    message: 'Không tìm thấy đơn hàng.',
  },
  ORDER_NOT_FULLY_PAID: {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    message: 'Đơn hàng chưa được thanh toán đầy đủ.',
  },
  RESERVATION_EXPIRED: {
    status: HttpStatus.CONFLICT,
    message: 'Thời hạn giữ hàng đã hết.',
  },
  PAYMENT_PROOF_DEADLINE_PASSED: {
    status: HttpStatus.CONFLICT,
    message: 'Đã quá hạn nộp bằng chứng thanh toán.',
  },
  PAYMENT_ALREADY_REVIEWED: {
    status: HttpStatus.CONFLICT,
    message: 'Thanh toán đã được xử lý trước đó.',
  },
  DEPOSIT_AMOUNT_INSUFFICIENT: {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    message: 'Số tiền nhận được chưa đủ khoản cọc bắt buộc.',
  },
  REFUND_AMOUNT_EXCEEDS_PAID: {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    message: 'Số tiền hoàn vượt quá khoản đã xác minh còn lại.',
  },
  WARRANTY_NOT_ACTIVE: {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    message: 'Bảo hành chưa hiệu lực, đã hết hạn hoặc đã bị vô hiệu hóa.',
  },
  AFTER_SALES_REQUEST_ALREADY_OPEN: {
    status: HttpStatus.CONFLICT,
    message: 'Sản phẩm đã có yêu cầu hậu mãi chưa kết thúc.',
  },
  AFTER_SALES_RESOLUTION_REQUIREMENTS_NOT_MET: {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    message: 'Yêu cầu hậu mãi chưa đủ điều kiện để ghi nhận kết quả này.',
  },
  EVIDENCE_REQUIRED: {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    message: 'Bằng chứng riêng tư là bắt buộc.',
  },
  EVIDENCE_INVALID: {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    message: 'Bằng chứng riêng tư không hợp lệ.',
  },
  VOUCHER_NOT_APPLICABLE: {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    message: 'Voucher không áp dụng được cho yêu cầu này.',
  },
  VOUCHER_USAGE_LIMIT_REACHED: {
    status: HttpStatus.CONFLICT,
    message: 'Voucher đã hết lượt sử dụng.',
  },
  ONE_TIME_TOKEN_INVALID: {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    message: 'Token không hợp lệ, đã hết hạn hoặc đã được sử dụng.',
  },
  CURRENT_PASSWORD_INCORRECT: {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    message: 'Mật khẩu hiện tại không đúng.',
  },
  RATE_LIMITED: {
    status: HttpStatus.TOO_MANY_REQUESTS,
    message: 'Bạn đã gửi quá nhiều yêu cầu.',
  },
  SERVICE_UNAVAILABLE: {
    status: HttpStatus.SERVICE_UNAVAILABLE,
    message: 'Dịch vụ tạm thời không khả dụng.',
  },
  STORAGE_UNAVAILABLE: {
    status: HttpStatus.SERVICE_UNAVAILABLE,
    message: 'Dịch vụ lưu trữ tạm thời không khả dụng.',
  },
  INTERNAL_ERROR: {
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    message: 'Đã xảy ra lỗi hệ thống.',
  },
};
