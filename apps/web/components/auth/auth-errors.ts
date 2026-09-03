import { AuthActionError } from '@/app/auth-provider';
import type { ErrorSummaryItem } from '@/components/ui';
import { PASSWORD_POLICY, type AuthFieldErrors, type AuthFieldName } from './auth-validation';

export type AuthFlow = 'forgot' | 'invitation' | 'login' | 'register' | 'reset';

export interface AuthFormIssue {
  errors: ErrorSummaryItem[];
  fields: AuthFieldErrors;
}

export const EMPTY_AUTH_ISSUE: AuthFormIssue = { errors: [], fields: {} };

export function withoutAuthFieldIssue(issue: AuthFormIssue, field: AuthFieldName): AuthFormIssue {
  if (issue.fields[field] === undefined) return issue;
  const fields = Object.fromEntries(
    Object.entries(issue.fields).filter(([candidate]) => candidate !== field),
  ) as AuthFieldErrors;
  return {
    fields,
    errors: issue.errors.filter(({ href }) => href !== `#${field}`),
  };
}

export function authIssueFromError(caught: unknown, flow: AuthFlow): AuthFormIssue {
  if (!(caught instanceof AuthActionError)) {
    return messageIssue(fallbackFor(flow));
  }

  switch (caught.code) {
    case 'INVALID_CREDENTIALS':
      return messageIssue('Email hoặc mật khẩu không đúng.');
    case 'ACCOUNT_UNAVAILABLE':
      return messageIssue(
        'Tài khoản đang bị tạm khóa hoặc vô hiệu hóa. Hãy liên hệ rePhone để được hỗ trợ.',
      );
    case 'DUPLICATE_RESOURCE':
      return flow === 'register'
        ? messageIssue(
            'Không thể hoàn tất đăng ký. Hãy kiểm tra lại thông tin hoặc đăng nhập nếu bạn đã có tài khoản.',
          )
        : messageIssue(fallbackFor(flow));
    case 'ONE_TIME_TOKEN_INVALID':
      return messageIssue(
        flow === 'invitation'
          ? 'Lời mời không hợp lệ, đã hết hạn hoặc đã được sử dụng.'
          : 'Liên kết đặt lại mật khẩu không hợp lệ, đã hết hạn hoặc đã được sử dụng.',
      );
    case 'RATE_LIMITED':
      return messageIssue('Bạn đã thử quá nhiều lần. Vui lòng chờ một lúc rồi thử lại.');
    case 'VALIDATION_FAILED':
    case 'MALFORMED_JSON':
      return validationIssue(caught, flow);
    case 'NETWORK_ERROR':
      return messageIssue('Không thể kết nối tới rePhone. Kiểm tra mạng rồi thử lại.');
    case 'SERVICE_UNAVAILABLE':
    case 'STORAGE_UNAVAILABLE':
      return messageIssue('Dịch vụ đang tạm gián đoạn. Vui lòng thử lại sau.');
    case 'INTERNAL_ERROR':
    case 'INVALID_RESPONSE':
      return messageIssue('Hệ thống chưa thể xử lý yêu cầu. Vui lòng thử lại.');
    default:
      return messageIssue(fallbackFor(flow));
  }
}

export function issueFromFields(fields: AuthFieldErrors): AuthFormIssue {
  const errors = (Object.entries(fields) as Array<[AuthFieldName, string | undefined]>).flatMap(
    ([field, message]) =>
      message === undefined ? [] : [{ href: `#${field}` as `#${string}`, message }],
  );
  return { errors, fields };
}

function validationIssue(error: AuthActionError, flow: AuthFlow): AuthFormIssue {
  const fields: AuthFieldErrors = {};
  for (const detail of error.details) {
    const field = normalizeField(detail.field);
    if (field !== undefined && fields[field] === undefined) fields[field] = validationCopy(field);
  }
  if (Object.keys(fields).length > 0) return issueFromFields(fields);

  if (flow === 'reset' || flow === 'invitation') return fieldIssue('password', PASSWORD_POLICY);
  if (flow === 'forgot') return fieldIssue('email', 'Nhập một địa chỉ email hợp lệ.');
  return messageIssue('Kiểm tra lại thông tin đã nhập.');
}

function normalizeField(field: string | undefined): AuthFieldName | undefined {
  if (field === 'newPassword') return 'password';
  if (
    field === 'confirmation' ||
    field === 'email' ||
    field === 'fullName' ||
    field === 'password' ||
    field === 'phone'
  ) {
    return field;
  }
  return undefined;
}

function validationCopy(field: AuthFieldName): string {
  switch (field) {
    case 'email':
      return 'Nhập một địa chỉ email hợp lệ.';
    case 'fullName':
      return 'Họ và tên phải dài 1–255 ký tự.';
    case 'phone':
      return 'Số điện thoại không được quá 32 ký tự.';
    case 'confirmation':
      return 'Mật khẩu xác nhận chưa khớp.';
    case 'password':
      return PASSWORD_POLICY;
  }
}

function fieldIssue(field: AuthFieldName, message: string): AuthFormIssue {
  return { errors: [{ href: `#${field}`, message }], fields: { [field]: message } };
}

function messageIssue(message: string): AuthFormIssue {
  return { errors: [{ message }], fields: {} };
}

function fallbackFor(flow: AuthFlow): string {
  switch (flow) {
    case 'login':
      return 'Không thể đăng nhập. Vui lòng thử lại.';
    case 'register':
      return 'Không thể tạo tài khoản. Vui lòng thử lại.';
    case 'forgot':
      return 'Không thể gửi yêu cầu. Vui lòng thử lại.';
    case 'reset':
      return 'Không thể đặt lại mật khẩu. Vui lòng thử lại.';
    case 'invitation':
      return 'Không thể kích hoạt tài khoản. Vui lòng thử lại.';
  }
}
