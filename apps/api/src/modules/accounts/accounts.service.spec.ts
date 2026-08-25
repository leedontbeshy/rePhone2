/* eslint-disable @typescript-eslint/require-await */
import { describe, expect, it, vi } from 'vitest';
import type { ApiError } from '../../common/errors/api-error.js';
import type { CustomerAddress, User } from '../../generated/prisma/client.js';
import type { AuthContext } from '../auth/auth-context.js';
import { AccountsService } from './accounts.service.js';

const USER_ID = '0199b900-0000-7000-8000-000000000001';
const ADDRESS_ID = '0199b900-0000-7000-8000-000000000002';
const customerAuth: AuthContext = {
  userId: USER_ID,
  role: 'CUSTOMER',
  sessionId: '0199b900-0000-7000-8000-000000000003',
};
const employeeAuth: AuthContext = { ...customerAuth, role: 'EMPLOYEE' };

describe('AccountsService', () => {
  it('projects customer and staff accounts without leaking password data', async () => {
    const customerFixture = createFixture({ findAccount: vi.fn(async () => user()) });
    await expect(customerFixture.service.getAccount(customerAuth)).resolves.toEqual({
      id: USER_ID,
      email: 'customer@rephone.local',
      role: 'CUSTOMER',
      status: 'ACTIVE',
      fullName: 'Demo Customer',
      phone: '0900000000',
      emailVerifiedAt: null,
    });

    const hiredAt = new Date('2026-08-01T00:00:00.000Z');
    const staffFixture = createFixture({
      findAccount: vi.fn(async () =>
        user({ role: 'EMPLOYEE', employeeCode: null, hiredAt, email: 'staff@rephone.local' }),
      ),
    });
    await expect(staffFixture.service.getAccount(employeeAuth)).resolves.toMatchObject({
      role: 'EMPLOYEE',
      staffProfile: { employeeCode: '', hiredAt },
    });
  });

  it('returns RESOURCE_NOT_FOUND when an account no longer exists', async () => {
    const fixture = createFixture({ findAccount: vi.fn(async () => null) });

    await expect(fixture.service.getAccount(customerAuth)).rejects.toMatchObject({
      code: 'RESOURCE_NOT_FOUND',
    } satisfies Partial<ApiError>);
    await expect(
      fixture.service.updateAccount(customerAuth, { fullName: 'Updated' }),
    ).rejects.toMatchObject({ code: 'RESOURCE_NOT_FOUND' } satisfies Partial<ApiError>);
  });

  it('trims changed names and only sends fields present in an account update', async () => {
    const updateAccount = vi.fn(async () =>
      user({ fullName: 'Updated Name', phone: null, updatedAt: new Date('2026-08-25T00:00:00Z') }),
    );
    const fixture = createFixture({ updateAccount });

    await fixture.service.updateAccount(customerAuth, {
      fullName: '  Updated Name  ',
      phone: null,
    });
    expect(updateAccount).toHaveBeenCalledWith(USER_ID, {
      fullName: 'Updated Name',
      phone: null,
    });

    await fixture.service.updateAccount(customerAuth, {});
    expect(updateAccount).toHaveBeenLastCalledWith(USER_ID, {});
  });

  it('limits address operations to customers', async () => {
    const fixture = createFixture();

    await expect(fixture.service.listAddresses(employeeAuth)).rejects.toMatchObject({
      code: 'FORBIDDEN',
    } satisfies Partial<ApiError>);
    await expect(
      fixture.service.createAddress(employeeAuth, createAddressInput()),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' } satisfies Partial<ApiError>);
    await expect(fixture.service.updateAddress(employeeAuth, ADDRESS_ID, {})).rejects.toMatchObject(
      { code: 'FORBIDDEN' } satisfies Partial<ApiError>,
    );
    await expect(fixture.service.archiveAddress(employeeAuth, ADDRESS_ID)).rejects.toMatchObject({
      code: 'FORBIDDEN',
    } satisfies Partial<ApiError>);
    expect(fixture.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('lists safe active address projections', async () => {
    const updatedAt = new Date('2026-08-25T00:00:00.000Z');
    const fixture = createFixture({
      listAddresses: vi.fn(async () => [address({ label: null, postalCode: null, updatedAt })]),
    });

    await expect(fixture.service.listAddresses(customerAuth)).resolves.toEqual([
      expect.objectContaining({
        id: ADDRESS_ID,
        label: null,
        postalCode: null,
        updatedAt,
      }),
    ]);
  });

  it('creates a default address under the user lock and clears the old default first', async () => {
    const clearDefaultAddress = vi.fn(async () => ({ count: 1 }));
    const createAddress = vi.fn(async () => address({ isDefault: true }));
    const fixture = createFixture({ clearDefaultAddress, createAddress });

    await expect(
      fixture.service.createAddress(customerAuth, {
        ...createAddressInput(),
        label: 'Nhà',
        postalCode: '700000',
        isDefault: true,
      }),
    ).resolves.toMatchObject({ id: ADDRESS_ID, isDefault: true });
    expect(clearDefaultAddress).toHaveBeenCalledWith(USER_ID, fixture.transaction);
    expect(createAddress).toHaveBeenCalledWith(
      USER_ID,
      expect.objectContaining({ label: 'Nhà', postalCode: '700000', isDefault: true }),
      fixture.transaction,
    );
  });

  it('creates a non-default address without optional fields or clearing defaults', async () => {
    const clearDefaultAddress = vi.fn();
    const createAddress = vi.fn(async () => address());
    const fixture = createFixture({ clearDefaultAddress, createAddress });

    await fixture.service.createAddress(customerAuth, createAddressInput());

    expect(clearDefaultAddress).not.toHaveBeenCalled();
    expect(createAddress).toHaveBeenCalledWith(
      USER_ID,
      {
        ...createAddressInput(),
        isDefault: false,
      },
      fixture.transaction,
    );
  });

  it('rolls back address creation when the user lock fails', async () => {
    const createAddress = vi.fn();
    const fixture = createFixture({ lockUser: vi.fn(async () => false), createAddress });

    await expect(
      fixture.service.createAddress(customerAuth, createAddressInput()),
    ).rejects.toMatchObject({ code: 'RESOURCE_NOT_FOUND' } satisfies Partial<ApiError>);
    expect(createAddress).not.toHaveBeenCalled();
  });

  it('updates only supplied address fields and clears a previous default when requested', async () => {
    const clearDefaultAddress = vi.fn(async () => ({ count: 1 }));
    const updateAddress = vi.fn(async () =>
      address({ label: null, receiverName: 'New Receiver', postalCode: null, isDefault: true }),
    );
    const fixture = createFixture({ clearDefaultAddress, updateAddress });

    await fixture.service.updateAddress(customerAuth, ADDRESS_ID, {
      label: null,
      receiverName: 'New Receiver',
      phone: '0911111111',
      addressLine: '2 Test Street',
      ward: 'Ward 2',
      district: 'District 2',
      province: 'HCM',
      postalCode: null,
      isDefault: true,
    });

    expect(clearDefaultAddress).toHaveBeenCalledWith(USER_ID, fixture.transaction);
    expect(updateAddress).toHaveBeenCalledWith(
      ADDRESS_ID,
      {
        label: null,
        receiverName: 'New Receiver',
        phone: '0911111111',
        addressLine: '2 Test Street',
        ward: 'Ward 2',
        district: 'District 2',
        province: 'HCM',
        postalCode: null,
        isDefault: true,
      },
      fixture.transaction,
    );
  });

  it('supports an empty sparse address update without clearing the default', async () => {
    const clearDefaultAddress = vi.fn();
    const updateAddress = vi.fn(async () => address());
    const fixture = createFixture({ clearDefaultAddress, updateAddress });

    await fixture.service.updateAddress(customerAuth, ADDRESS_ID, {});

    expect(clearDefaultAddress).not.toHaveBeenCalled();
    expect(updateAddress).toHaveBeenCalledWith(ADDRESS_ID, {}, fixture.transaction);
  });

  it.each([
    ['missing locked user', false, address(), 'RESOURCE_NOT_FOUND'],
    ['foreign or archived address', true, null, 'RESOURCE_NOT_FOUND'],
  ] as const)('rejects update for %s', async (_label, lockResult, foundAddress, code) => {
    const updateAddress = vi.fn();
    const fixture = createFixture({
      lockUser: vi.fn(async () => lockResult),
      findAddress: vi.fn(async () => foundAddress),
      updateAddress,
    });

    await expect(fixture.service.updateAddress(customerAuth, ADDRESS_ID, {})).rejects.toMatchObject(
      {
        code,
      },
    );
    expect(updateAddress).not.toHaveBeenCalled();
  });

  it('archives an owned address and rejects missing lock/ownership', async () => {
    const updateAddress = vi.fn(
      async (id: string, data: { archivedAt: Date }, transaction: unknown) => {
        void id;
        void data;
        void transaction;
        return address();
      },
    );
    const fixture = createFixture({ updateAddress });
    await fixture.service.archiveAddress(customerAuth, ADDRESS_ID);
    expect(updateAddress).toHaveBeenCalledOnce();
    const [updatedId, data, transaction] = updateAddress.mock.calls[0] ?? [];
    expect(updatedId).toBe(ADDRESS_ID);
    expect(data?.archivedAt).toBeInstanceOf(Date);
    expect(transaction).toBe(fixture.transaction);

    const lockFailure = createFixture({ lockUser: vi.fn(async () => false) });
    await expect(
      lockFailure.service.archiveAddress(customerAuth, ADDRESS_ID),
    ).rejects.toMatchObject({
      code: 'RESOURCE_NOT_FOUND',
    });

    const missingAddress = createFixture({ findAddress: vi.fn(async () => null) });
    await expect(
      missingAddress.service.archiveAddress(customerAuth, ADDRESS_ID),
    ).rejects.toMatchObject({ code: 'RESOURCE_NOT_FOUND' });
  });
});

function createFixture(repositoryOverrides: Record<string, unknown> = {}) {
  const transaction = { marker: 'accounts-transaction' };
  const prisma = {
    $transaction: vi.fn(async (work: (client: unknown) => Promise<unknown>) => work(transaction)),
  };
  const repository = {
    findAccount: vi.fn(async () => user()),
    updateAccount: vi.fn(async () => user()),
    listAddresses: vi.fn(async () => [address()]),
    lockUser: vi.fn(async () => true),
    clearDefaultAddress: vi.fn(async () => ({ count: 0 })),
    createAddress: vi.fn(async () => address()),
    findAddress: vi.fn(async () => address()),
    updateAddress: vi.fn(async () => address()),
    ...repositoryOverrides,
  };
  return {
    transaction,
    prisma,
    repository,
    service: new AccountsService(prisma as never, repository as never),
  };
}

function user(overrides: Partial<User> = {}): User {
  const now = new Date('2026-08-01T00:00:00.000Z');
  return {
    id: USER_ID,
    email: 'customer@rephone.local',
    normalizedEmail: 'customer@rephone.local',
    passwordHash: 'hash',
    role: 'CUSTOMER',
    status: 'ACTIVE',
    fullName: 'Demo Customer',
    phone: '0900000000',
    employeeCode: null,
    hiredAt: null,
    emailVerifiedAt: null,
    passwordChangedAt: null,
    lastLoginAt: null,
    suspendedAt: null,
    disabledAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function address(overrides: Partial<CustomerAddress> = {}): CustomerAddress {
  const now = new Date('2026-08-01T00:00:00.000Z');
  return {
    id: ADDRESS_ID,
    userId: USER_ID,
    label: 'Nhà',
    receiverName: 'Demo Customer',
    phone: '0900000000',
    addressLine: '1 Test Street',
    ward: 'Ward 1',
    district: 'District 1',
    province: 'HCM',
    postalCode: '700000',
    isDefault: false,
    archivedAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function createAddressInput() {
  return {
    receiverName: 'Demo Customer',
    phone: '0900000000',
    addressLine: '1 Test Street',
    ward: 'Ward 1',
    district: 'District 1',
    province: 'HCM',
  };
}
