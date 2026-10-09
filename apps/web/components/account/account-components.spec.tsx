import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import {
  AccountSummary,
  acceptAccountForOwner,
  accountForOwner,
  commitProfileUpdate,
  validateProfile,
} from './account-profile';
import { AccountLogoutAction } from './account-shell';
import {
  AccountAnonymousState,
  AccountLoadingState,
  AccountPermissionState,
} from './account-states';
import {
  AddressArchiveConfirmation,
  acceptAddressesForOwner,
  addressInteractionLocked,
  addressesForOwner,
  focusFirstAvailable,
  validateAddressDraft,
} from './address-book';
import { settleLogoutBeforeCompletion, validatePasswordChange } from './security-settings';

const ADDRESS = {
  id: '0199b354-d818-7f7c-b966-3932599978d1',
  label: 'Nhà',
  receiverName: 'Nguyễn Văn An',
  phone: '0900000000',
  addressLine: '12 Nguyễn Huệ',
  ward: 'Bến Nghé',
  district: 'Quận 1',
  province: 'TP. Hồ Chí Minh',
  postalCode: null,
  isDefault: true,
  createdAt: '2026-08-27T00:00:00.000Z',
  updatedAt: '2026-08-27T00:00:00.000Z',
};
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn() }),
  usePathname: () => '/account',
}));

describe('account self-service components', () => {
  it('renders explicit loading, anonymous return target and staff-safe account states', () => {
    const loading = renderToStaticMarkup(<AccountLoadingState label="Đang tải hồ sơ" />);
    const anonymous = renderToStaticMarkup(<AccountAnonymousState returnTo="/account/security" />);
    const permission = renderToStaticMarkup(<AccountPermissionState />);
    const summary = renderToStaticMarkup(
      <AccountSummary
        account={{
          id: '0199b354-d818-7f7c-b966-3932599978d0',
          email: 'staff@example.com',
          role: 'EMPLOYEE',
          status: 'ACTIVE',
          fullName: 'Nhân viên Demo',
          phone: null,
          emailVerifiedAt: null,
          staffProfile: { employeeCode: 'EMP-001', hiredAt: null },
        }}
      />,
    );

    expect(loading).toContain('aria-busy="true"');
    expect(anonymous).toContain('Đang mở trang đăng nhập…');
    expect(anonymous).not.toContain('<a');
    expect(anonymous).not.toMatch(
      /access token|refresh session|cookie|localStorage|fragment|ADMIN|phiên đăng nhập/i,
    );
    expect(permission).toContain('Khu vực dành cho khách hàng');
    expect(summary).toContain('EMP-001');
    expect(summary).not.toContain('password');
    expect(summary).not.toContain('session');
  });

  it('exposes an explicit pending-safe logout action on the account surface', () => {
    const markup = renderToStaticMarkup(<AccountLogoutAction pending={true} onLogout={vi.fn()} />);

    expect(markup).toContain('Đang đăng xuất');
    expect(markup).toContain('aria-busy="true"');
    expect(markup).toContain('disabled');
  });

  it('uses a focused inline delete confirmation and explains default-address semantics', () => {
    const markup = renderToStaticMarkup(
      <AddressArchiveConfirmation
        address={ADDRESS}
        pending={false}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    expect(markup).toContain('role="alert"');
    expect(markup).toContain('tabindex="-1"');
    expect(markup).not.toContain('alertdialog');
    expect(markup).toContain('không tự chọn địa chỉ khác');
    expect(markup).toContain('Xác nhận xóa');
    expect(markup).toContain('Giữ lại');
  });

  it('validates profile and address fields before sending generated payloads', () => {
    expect(validateProfile({ fullName: '   ', phone: null })).toEqual({
      fullName: 'Nhập họ và tên.',
    });
    const addressErrors = validateAddressDraft({
      label: '',
      receiverName: '',
      phone: '',
      addressLine: '',
      ward: '',
      district: '',
      province: '',
      postalCode: '',
      isDefault: false,
    });
    expect(addressErrors.receiverName).toBeTruthy();
    expect(addressErrors.phone).toBeTruthy();
    expect(addressErrors.addressLine).toBeTruthy();
    expect(addressErrors.ward).toBeTruthy();
    expect(addressErrors.district).toBeTruthy();
    expect(addressErrors.province).toBeTruthy();
  });

  it('enforces the documented password policy and confirmation locally', () => {
    expect(
      validatePasswordChange(
        { currentPassword: 'OldPassword1', newPassword: 'letters-only' },
        'different',
      ),
    ).toEqual({
      newPassword: 'Mật khẩu mới phải có ít nhất một chữ và một số.',
      confirmation: 'Mật khẩu nhập lại chưa khớp.',
    });
    expect(
      validatePasswordChange(
        { currentPassword: 'OldPassword1', newPassword: 'NewPassword2' },
        'NewPassword2',
      ),
    ).toEqual({});
  });

  it('syncs the authoritative profile into both account and auth state', () => {
    const events: string[] = [];
    const account = {
      id: '0199b354-d818-7f7c-b966-3932599978d0',
      email: 'an@example.com',
      role: 'CUSTOMER' as const,
      status: 'ACTIVE' as const,
      fullName: 'Nguyễn Văn An mới',
      phone: null,
      emailVerifiedAt: null,
    };
    const syncedProfiles: unknown[] = [];

    commitProfileUpdate(
      account,
      account.id,
      () => {
        events.push('account');
      },
      (profile) => {
        events.push('auth');
        syncedProfiles.push(profile);
      },
    );

    expect(events).toEqual(['account', 'auth']);
    expect(syncedProfiles).toEqual([{ id: account.id, fullName: account.fullName, phone: null }]);
  });

  it('rejects a profile update response owned by another account', () => {
    const account = {
      id: 'account-a',
      email: 'an@example.com',
      role: 'CUSTOMER' as const,
      status: 'ACTIVE' as const,
      fullName: 'Nguyễn Văn An',
      phone: null,
      emailVerifiedAt: null,
    };
    const onUpdated = vi.fn();
    const syncAccountProfile = vi.fn();

    expect(commitProfileUpdate(account, 'account-b', onUpdated, syncAccountProfile)).toBe(false);
    expect(onUpdated).not.toHaveBeenCalled();
    expect(syncAccountProfile).not.toHaveBeenCalled();
  });

  it('never exposes or accepts profile data for another signed-in owner', () => {
    const accountA = {
      id: 'account-a',
      email: 'a@example.com',
      role: 'CUSTOMER' as const,
      status: 'ACTIVE' as const,
      fullName: 'Khách A',
      phone: null,
      emailVerifiedAt: null,
    };
    const accountB = { ...accountA, id: 'account-b', email: 'b@example.com', fullName: 'Khách B' };
    const stateB = { ownerId: accountB.id, account: accountB };

    expect(accountForOwner({ ownerId: accountA.id, account: accountA }, accountB.id)).toBeNull();
    expect(acceptAccountForOwner(stateB, accountA.id, accountB.id, accountA)).toBe(stateB);
    expect(acceptAccountForOwner(stateB, accountB.id, accountB.id, accountB)).toEqual(stateB);
  });

  it('never exposes or accepts an address response for another signed-in owner', () => {
    const addressB = { ...ADDRESS, id: 'address-b', receiverName: 'Khách B' };
    const stateB = { ownerId: 'account-b', addresses: [addressB] };

    expect(addressesForOwner({ ownerId: 'account-a', addresses: [ADDRESS] }, 'account-b')).toEqual(
      [],
    );
    expect(acceptAddressesForOwner(stateB, 'account-a', 'account-b', [ADDRESS])).toBe(stateB);
    expect(acceptAddressesForOwner(stateB, 'account-b', 'account-b', [addressB])).toEqual(stateB);
  });

  it('waits for logout to settle before exposing the login-again state', async () => {
    let settleLogout: (() => void) | undefined;
    const completed = vi.fn();
    const work = settleLogoutBeforeCompletion(
      () =>
        new Promise<void>((resolve) => {
          settleLogout = resolve;
        }),
      completed,
    );

    expect(completed).not.toHaveBeenCalled();
    settleLogout?.();
    await work;
    expect(completed).toHaveBeenCalledOnce();

    const completedAfterFailure = vi.fn();
    await settleLogoutBeforeCompletion(
      () => Promise.reject(new Error('network unavailable')),
      completedAfterFailure,
    );
    expect(completedAfterFailure).toHaveBeenCalledOnce();
  });

  it('globally locks address actions and restores the first safe focus target', () => {
    expect(
      addressInteractionLocked({
        editorOpen: true,
        editorPending: false,
        confirmationOpen: false,
        archivePending: false,
      }),
    ).toBe(true);
    expect(
      addressInteractionLocked({
        editorOpen: false,
        editorPending: false,
        confirmationOpen: false,
        archivePending: false,
      }),
    ).toBe(false);

    const focus = vi.fn();
    const documentLike: Pick<Document, 'getElementById'> = {
      getElementById: (id) => (id === 'fallback' ? ({ focus } as unknown as HTMLElement) : null),
    };
    expect(focusFirstAvailable(documentLike, ['missing', 'fallback'])).toBe(true);
    expect(focus).toHaveBeenCalledOnce();
  });
});
