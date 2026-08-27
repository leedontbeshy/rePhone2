import type { createApiClient, components } from '@rephone/api-client';

export type Account = components['schemas']['AccountDto'];
export type AccountUpdate = components['schemas']['UpdateAccountDto'];
export type AccountAddress = components['schemas']['AddressDto'];
export type AddressCreate = components['schemas']['CreateAddressDto'];
export type AddressUpdate = components['schemas']['UpdateAddressDto'];
export type PasswordChange = components['schemas']['ChangePasswordDto'];
export type AccountApiClient = Pick<
  ReturnType<typeof createApiClient>,
  'DELETE' | 'GET' | 'PATCH' | 'POST'
>;

type ApiErrorBody = components['schemas']['ApiErrorBodyDto'];
type ApiErrorDetail = components['schemas']['ApiErrorDetailDto'];

export class AccountRequestError extends Error {
  public constructor(
    message: string,
    public readonly code?: ApiErrorBody['code'],
    public readonly status?: number,
    public readonly details: readonly ApiErrorDetail[] = [],
  ) {
    super(message);
    this.name = 'AccountRequestError';
  }

  public get isConflict(): boolean {
    return (
      this.status === 409 ||
      this.code === 'CONCURRENT_MODIFICATION' ||
      this.code === 'DUPLICATE_RESOURCE' ||
      this.code === 'SETTINGS_VERSION_CONFLICT'
    );
  }

  public get isForbidden(): boolean {
    return this.status === 403 || this.code === 'FORBIDDEN';
  }
}

export async function getAccount(client: AccountApiClient): Promise<Account> {
  const result = await client.GET('/api/v1/account');
  if (result.data === undefined) {
    throw accountRequestError(
      result.error,
      'Không thể tải thông tin tài khoản.',
      result.response.status,
    );
  }
  return result.data.data;
}

export async function updateAccount(
  client: AccountApiClient,
  input: AccountUpdate,
): Promise<Account> {
  const result = await client.PATCH('/api/v1/account', { body: input });
  if (result.data === undefined) {
    throw accountRequestError(
      result.error,
      'Không thể cập nhật thông tin tài khoản.',
      result.response.status,
    );
  }
  return result.data.data;
}

export async function listAccountAddresses(client: AccountApiClient): Promise<AccountAddress[]> {
  const result = await client.GET('/api/v1/account/addresses');
  if (result.data === undefined) {
    throw accountRequestError(result.error, 'Không thể tải sổ địa chỉ.', result.response.status);
  }
  return result.data.data;
}

export async function createAccountAddress(
  client: AccountApiClient,
  input: AddressCreate,
): Promise<AccountAddress> {
  const result = await client.POST('/api/v1/account/addresses', { body: input });
  if (result.data === undefined) {
    throw accountRequestError(result.error, 'Không thể thêm địa chỉ.', result.response.status);
  }
  return result.data.data;
}

export async function updateAccountAddress(
  client: AccountApiClient,
  addressId: string,
  input: AddressUpdate,
): Promise<AccountAddress> {
  const result = await client.PATCH('/api/v1/account/addresses/{id}', {
    params: { path: { id: addressId } },
    body: input,
  });
  if (result.data === undefined) {
    throw accountRequestError(result.error, 'Không thể cập nhật địa chỉ.', result.response.status);
  }
  return result.data.data;
}

export async function archiveAccountAddress(
  client: AccountApiClient,
  addressId: string,
): Promise<void> {
  const result = await client.DELETE('/api/v1/account/addresses/{id}', {
    params: { path: { id: addressId } },
  });
  if (result.error !== undefined) {
    throw accountRequestError(result.error, 'Không thể xóa địa chỉ.', result.response.status);
  }
}

export async function changeAccountPassword(
  client: AccountApiClient,
  input: PasswordChange,
): Promise<void> {
  const result = await client.POST('/api/v1/account/change-password', { body: input });
  if (result.error !== undefined) {
    throw accountRequestError(result.error, 'Không thể đổi mật khẩu.', result.response.status);
  }
}

export function accountRequestError(
  value: unknown,
  fallback: string,
  status?: number,
): AccountRequestError {
  if (!isRecord(value) || !isRecord(value['error'])) {
    return new AccountRequestError(fallback, undefined, status);
  }

  const body = value['error'];
  const code = isApiErrorCode(body['code']) ? body['code'] : undefined;
  const details = Array.isArray(body['details'])
    ? body['details'].filter(isApiErrorDetail).map(customerAccountErrorDetail)
    : [];

  return new AccountRequestError(
    customerAccountErrorMessage(code, status, fallback),
    code,
    status,
    details,
  );
}

function customerAccountErrorDetail(detail: ApiErrorDetail): ApiErrorDetail {
  const messageByField: Readonly<Record<string, string>> = {
    fullName: 'Họ và tên chưa hợp lệ.',
    phone: 'Số điện thoại chưa hợp lệ.',
    label: 'Tên gợi nhớ chưa hợp lệ.',
    receiverName: 'Tên người nhận chưa hợp lệ.',
    addressLine: 'Địa chỉ chưa hợp lệ.',
    ward: 'Phường hoặc xã chưa hợp lệ.',
    district: 'Quận hoặc huyện chưa hợp lệ.',
    province: 'Tỉnh hoặc thành phố chưa hợp lệ.',
    postalCode: 'Mã bưu chính chưa hợp lệ.',
    isDefault: 'Lựa chọn địa chỉ mặc định chưa hợp lệ.',
    currentPassword: 'Mật khẩu hiện tại chưa hợp lệ.',
    newPassword: 'Mật khẩu mới chưa đáp ứng yêu cầu.',
  };
  const message =
    detail.code === 'NOT_UNIQUE' && detail.field === 'label'
      ? 'Tên gợi nhớ này đã được dùng.'
      : detail.field === undefined
        ? 'Thông tin chưa hợp lệ.'
        : (messageByField[detail.field] ?? 'Thông tin chưa hợp lệ.');
  return { ...detail, message };
}

function customerAccountErrorMessage(
  code: ApiErrorBody['code'] | undefined,
  status: number | undefined,
  fallback: string,
): string {
  if (
    status === 401 ||
    code === 'AUTH_REQUIRED' ||
    code === 'ACCESS_TOKEN_INVALID' ||
    code === 'SESSION_REVOKED'
  ) {
    return 'Bạn đã đăng xuất hoặc thời gian đăng nhập đã hết. Hãy đăng nhập lại.';
  }
  if (code === 'CSRF_VALIDATION_FAILED') {
    return 'Không thể xác nhận yêu cầu. Hãy tải lại trang rồi thử lại.';
  }
  if (code === 'MALFORMED_JSON') {
    return 'Thông tin gửi đi chưa hợp lệ. Hãy tải lại trang rồi thử lại.';
  }
  if (code === 'VALIDATION_FAILED') {
    return 'Thông tin chưa hợp lệ. Hãy kiểm tra lại các mục đã nhập.';
  }
  if (code === 'CURRENT_PASSWORD_INCORRECT') {
    return 'Mật khẩu hiện tại chưa đúng.';
  }
  if (code === 'DUPLICATE_RESOURCE') {
    return 'Thông tin này đã tồn tại. Hãy kiểm tra lại.';
  }
  if (code === 'CONCURRENT_MODIFICATION' || code === 'SETTINGS_VERSION_CONFLICT') {
    return 'Thông tin vừa thay đổi. Hãy tải lại trang rồi thử lại.';
  }
  if (code === 'INVALID_STATE_TRANSITION') {
    return 'Thao tác này không còn phù hợp với trạng thái hiện tại.';
  }
  if (code === 'FORBIDDEN') {
    return 'Bạn không có quyền thực hiện thao tác này.';
  }
  if (code === 'RESOURCE_NOT_FOUND') {
    return 'Không tìm thấy thông tin bạn đang cần.';
  }
  if (code === 'ACCOUNT_UNAVAILABLE') {
    return 'Tài khoản hiện không thể thực hiện thao tác này.';
  }
  if (code === 'RATE_LIMITED') {
    return 'Bạn đã thao tác quá nhiều lần. Vui lòng thử lại sau.';
  }
  if (code === 'SERVICE_UNAVAILABLE' || code === 'STORAGE_UNAVAILABLE') {
    return 'Dịch vụ đang tạm gián đoạn. Vui lòng thử lại sau.';
  }
  if (code === 'INTERNAL_ERROR') {
    return 'Hệ thống chưa thể xử lý yêu cầu. Vui lòng thử lại.';
  }
  return fallback;
}

function isApiErrorCode(value: unknown): value is ApiErrorBody['code'] {
  return typeof value === 'string';
}

function isApiErrorDetail(value: unknown): value is ApiErrorDetail {
  return (
    isRecord(value) &&
    typeof value['code'] === 'string' &&
    typeof value['message'] === 'string' &&
    (value['field'] === undefined || typeof value['field'] === 'string')
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
