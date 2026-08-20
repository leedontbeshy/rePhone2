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
  DUPLICATE_RESOURCE: {
    status: HttpStatus.CONFLICT,
    message: 'Tài nguyên đã tồn tại.',
  },
  CONCURRENT_MODIFICATION: {
    status: HttpStatus.CONFLICT,
    message: 'Dữ liệu đã được thay đổi đồng thời. Vui lòng thử lại.',
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
