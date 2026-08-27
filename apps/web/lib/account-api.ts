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
  const message =
    typeof body['message'] === 'string' && body['message'].trim() !== ''
      ? body['message']
      : fallback;
  const details = Array.isArray(body['details']) ? body['details'].filter(isApiErrorDetail) : [];

  return new AccountRequestError(message, code, status, details);
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
