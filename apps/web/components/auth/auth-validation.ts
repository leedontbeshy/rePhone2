export const PASSWORD_POLICY =
  'Dài 8–128 ký tự, có ít nhất một chữ và một số, không có khoảng trắng ở đầu hoặc cuối.';

export type AuthFieldName = 'confirmation' | 'email' | 'fullName' | 'password' | 'phone';

export type AuthFieldErrors = Partial<Record<AuthFieldName, string>>;

export function emailError(email: string): string | undefined {
  if (email.length === 0) return 'Nhập email của bạn.';
  if (email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return 'Nhập một địa chỉ email hợp lệ.';
  }
  return undefined;
}

export function loginPasswordError(password: string): string | undefined {
  if (password.length === 0) return 'Nhập mật khẩu của bạn.';
  if (password.length < 8 || password.length > 128) return 'Mật khẩu phải dài 8–128 ký tự.';
  return undefined;
}

export function passwordPolicyError(password: string): string | undefined {
  if (
    password.length < 8 ||
    password.length > 128 ||
    !/[A-Za-z]/.test(password) ||
    !/\d/.test(password) ||
    /^\s/.test(password) ||
    /\s$/.test(password)
  ) {
    return PASSWORD_POLICY;
  }
  return undefined;
}

export function confirmationError(password: string, confirmation: string): string | undefined {
  if (confirmation.length === 0) return 'Nhập lại mật khẩu mới.';
  if (password !== confirmation) return 'Mật khẩu xác nhận chưa khớp.';
  return undefined;
}

export function registrationProfileErrors(
  fullName: string,
  phone: string,
): Pick<AuthFieldErrors, 'fullName' | 'phone'> {
  const errors: Pick<AuthFieldErrors, 'fullName' | 'phone'> = {};
  if (fullName.trim().length === 0 || fullName.trim().length > 255) {
    errors.fullName = 'Họ và tên phải dài 1–255 ký tự.';
  }
  if (phone.trim().length > 32) errors.phone = 'Số điện thoại không được quá 32 ký tự.';
  return errors;
}
