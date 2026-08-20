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
  FORBIDDEN: {
    status: HttpStatus.FORBIDDEN,
    message: 'Bạn không có quyền thực hiện thao tác này.',
  },
  RESOURCE_NOT_FOUND: {
    status: HttpStatus.NOT_FOUND,
    message: 'Không tìm thấy tài nguyên.',
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
