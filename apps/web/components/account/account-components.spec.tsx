import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { AccountSummary, commitProfileUpdate, validateProfile } from './account-profile';
import { AccountLogoutAction } from './account-shell';
import {
  AccountAnonymousState,
  AccountLoadingState,
  AccountPermissionState,
} from './account-states';
import {
  AddressArchiveConfirmation,
  addressInteractionLocked,
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
    expect(anonymous).toContain('returnTo=%2Faccount%2Fsecurity');
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
