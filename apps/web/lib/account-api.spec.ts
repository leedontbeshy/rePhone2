import { describe, expect, it, vi } from 'vitest';
import {
  AccountRequestError,
  accountRequestError,
  archiveAccountAddress,
  changeAccountPassword,
  createAccountAddress,
  getAccount,
  listAccountAddresses,
  updateAccount,
  updateAccountAddress,
  type AccountApiClient,
} from './account-api';

const RESPONSE = new Response(null, { status: 200 });
const ACCOUNT = {
  id: '0199b354-d818-7f7c-b966-3932599978d0',
  email: 'an@example.com',
  role: 'CUSTOMER' as const,
  status: 'ACTIVE' as const,
  fullName: 'Nguyễn Văn An',
  phone: '0900000000',
  emailVerifiedAt: null,
};
const ADDRESS = {
  id: '0199b354-d818-7f7c-b966-3932599978d1',
  label: 'Nhà',
  receiverName: ACCOUNT.fullName,
  phone: ACCOUNT.phone,
  addressLine: '12 Nguyễn Huệ',
  ward: 'Bến Nghé',
  district: 'Quận 1',
  province: 'TP. Hồ Chí Minh',
  postalCode: null,
  isDefault: true,
  createdAt: '2026-08-27T00:00:00.000Z',
  updatedAt: '2026-08-27T00:00:00.000Z',
};

describe('account generated-client adapter', () => {
  it('gets and updates the account with generated payloads', async () => {
    const get = vi.fn().mockResolvedValue({ data: { data: ACCOUNT }, response: RESPONSE });
    const patch = vi.fn().mockResolvedValue({ data: { data: ACCOUNT }, response: RESPONSE });
    const client = mockClient({ GET: get, PATCH: patch });

    await expect(getAccount(client)).resolves.toEqual(ACCOUNT);
    await expect(
      updateAccount(client, { fullName: ACCOUNT.fullName, phone: null }),
    ).resolves.toEqual(ACCOUNT);

    expect(get).toHaveBeenCalledWith('/api/v1/account');
    expect(patch).toHaveBeenCalledWith('/api/v1/account', {
      body: { fullName: ACCOUNT.fullName, phone: null },
    });
  });

  it('keeps the address list unpaginated and sends create/update bodies unchanged', async () => {
    const get = vi.fn().mockResolvedValue({ data: { data: [ADDRESS] }, response: RESPONSE });
    const post = vi.fn().mockResolvedValue({ data: { data: ADDRESS }, response: RESPONSE });
    const patch = vi.fn().mockResolvedValue({ data: { data: ADDRESS }, response: RESPONSE });
    const client = mockClient({ GET: get, PATCH: patch, POST: post });
    const createInput = {
      receiverName: ADDRESS.receiverName,
      phone: ADDRESS.phone,
      addressLine: ADDRESS.addressLine,
      ward: ADDRESS.ward,
      district: ADDRESS.district,
      province: ADDRESS.province,
      isDefault: true,
    };

    await expect(listAccountAddresses(client)).resolves.toEqual([ADDRESS]);
    await expect(createAccountAddress(client, createInput)).resolves.toEqual(ADDRESS);
    await expect(updateAccountAddress(client, ADDRESS.id, { label: null })).resolves.toEqual(
      ADDRESS,
    );

    expect(get).toHaveBeenCalledWith('/api/v1/account/addresses');
    expect(post).toHaveBeenCalledWith('/api/v1/account/addresses', { body: createInput });
    expect(patch).toHaveBeenCalledWith('/api/v1/account/addresses/{id}', {
      params: { path: { id: ADDRESS.id } },
      body: { label: null },
    });
  });

  it('archives an address without inventing a reason body', async () => {
    const remove = vi.fn().mockResolvedValue({ response: new Response(null, { status: 204 }) });

    await archiveAccountAddress(mockClient({ DELETE: remove }), ADDRESS.id);

    expect(remove).toHaveBeenCalledWith('/api/v1/account/addresses/{id}', {
      params: { path: { id: ADDRESS.id } },
    });
    expect(JSON.stringify(remove.mock.calls)).not.toContain('reason');
    expect(JSON.stringify(remove.mock.calls)).not.toContain('body');
  });

  it('posts password changes and exposes safe structured errors', async () => {
    const post = vi.fn().mockResolvedValue({ response: new Response(null, { status: 204 }) });
    const client = mockClient({ POST: post });

    await changeAccountPassword(client, {
      currentPassword: 'OldPassword1',
      newPassword: 'NewPassword2',
    });

    expect(post).toHaveBeenCalledWith('/api/v1/account/change-password', {
      body: { currentPassword: 'OldPassword1', newPassword: 'NewPassword2' },
    });

    const error = accountRequestError(
      {
        error: {
          code: 'DUPLICATE_RESOURCE',
          message: 'Dữ liệu đã thay đổi.',
          details: [{ code: 'NOT_UNIQUE', field: 'label', message: 'Nhãn đã tồn tại.' }],
        },
      },
      'fallback',
      409,
    );
    expect(error).toBeInstanceOf(AccountRequestError);
    expect(error.isConflict).toBe(true);
    expect(error.details).toEqual([
      { code: 'NOT_UNIQUE', field: 'label', message: 'Nhãn đã tồn tại.' },
    ]);
  });
});

function mockClient(methods: Record<string, unknown>): AccountApiClient {
  return methods as unknown as AccountApiClient;
}
