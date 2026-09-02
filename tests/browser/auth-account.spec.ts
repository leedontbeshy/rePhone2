import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page, type Request } from '@playwright/test';
import { browserTestTitle as bt } from '../../apps/web/lib/frontend-browser-coverage';
import {
  BROWSER_INVITATION_ACCOUNT,
  BROWSER_RESET_ACCOUNT,
} from '../../apps/api/test/browser/auth-fixtures';
import { stabilizeVisualPage } from './support/stabilize-visual-page';

const BROWSER_CUSTOMER = {
  email: 'browser-account@rephone.local',
  password: 'BrowserAccount123',
  newPassword: 'BrowserAccountDone123',
  fullName: 'Khách FE-02 Browser',
  updatedFullName: 'Khách FE-02 Đã Cập Nhật',
  phone: '0900000202',
} as const;

const FIRST_ADDRESS = {
  label: 'Nhà Browser',
  receiverName: 'Người nhận tại nhà',
  phone: '0900000211',
  postalCode: '700000',
  addressLine: '12 Đường Kiểm Thử',
  ward: 'Phường Browser',
  district: 'Quận Một',
  province: 'TP. Hồ Chí Minh',
} as const;

const SECOND_ADDRESS = {
  label: 'Văn phòng Browser',
  receiverName: 'Người nhận văn phòng',
  phone: '0900000212',
  postalCode: '700001',
  addressLine: '34 Đường Tự Động',
  ward: 'Phường Test',
  district: 'Quận Ba',
  province: 'TP. Hồ Chí Minh',
} as const;

const CHECKOUT_INVENTORY_PATH = '/products/iphone-13/units/IP13-BLU-001';

const BROWSER_RECOVERY_CUSTOMER = {
  email: 'browser-account-recovery@rephone.local',
  password: 'BrowserRecovery123',
  fullName: 'Khách kiểm tra phục hồi',
} as const;

test.describe('FE-2 authentication and account', () => {
  test.describe.configure({ mode: 'serial' });

  test(bt('browser:auth-account', 'reset-password-fragment'), async ({ page }) => {
    await login(page, BROWSER_RESET_ACCOUNT.email, BROWSER_RESET_ACCOUNT.oldPassword, '/account');
    let releaseLogout!: () => void;
    const logoutGate = new Promise<void>((resolve) => {
      releaseLogout = resolve;
    });
    await page.route('**/api/v1/auth/logout', async (route) => {
      await logoutGate;
      await route.continue();
    });
    let resetCompleted = false;
    const authenticatedRequestsAfterReset: string[] = [];
    page.on('request', (request) => {
      if (
        resetCompleted &&
        apiPath(request.url()).startsWith('/api/v1/') &&
        request.headers()['authorization'] !== undefined
      ) {
        authenticatedRequestsAfterReset.push(apiPath(request.url()));
      }
    });
    await page.goto(`/reset-password#token=${encodeURIComponent(BROWSER_RESET_ACCOUNT.token)}`);

    await expect(page.getByRole('heading', { level: 1, name: 'Đặt mật khẩu mới' })).toBeVisible();
    await expect(page.locator('#password')).toBeVisible();
    await expectFragmentTokenCleared(page, BROWSER_RESET_ACCOUNT.token);
    await expectNoHorizontalOverflow(page);
    await expectNoSeriousAccessibilityViolations(page, '/reset-password');

    await page.locator('#password').fill(BROWSER_RESET_ACCOUNT.newPassword);
    await page.locator('#confirmation').fill(BROWSER_RESET_ACCOUNT.newPassword);

    const resetResponse = page.waitForResponse(
      (response) =>
        apiPath(response.url()) === '/api/v1/auth/reset-password' &&
        response.request().method() === 'POST',
    );
    await page.getByRole('button', { name: 'Đổi mật khẩu', exact: true }).click();
    expect((await resetResponse).status()).toBe(204);
    await expect(page.getByText('Đang hoàn tất đổi mật khẩu…', { exact: true })).toBeVisible();
    await expect(page.getByText('Liên kết không dùng được', { exact: true })).toHaveCount(0);
    releaseLogout();
    resetCompleted = true;

    await expect(page.getByText('Mật khẩu đã được cập nhật', { exact: true })).toBeVisible();
    await expect(
      page.locator('div[tabindex="-1"]').filter({ hasText: 'Mật khẩu đã được cập nhật' }),
    ).toBeFocused();
    await expectNoRefreshCookie(page);
    await expectNoBrowserAuthSecrets(page, BROWSER_RESET_ACCOUNT.token);
    await page.locator('body').press('Enter');
    await expect(page.getByRole('button', { name: 'Đổi mật khẩu', exact: true })).toHaveCount(0);

    await page.goto('/account');
    await expect(
      page.getByRole('heading', { level: 2, name: 'Đăng nhập để quản lý tài khoản' }),
    ).toBeVisible();
    expect(authenticatedRequestsAfterReset).toEqual([]);

    await login(page, BROWSER_RESET_ACCOUNT.email, BROWSER_RESET_ACCOUNT.newPassword, '/account');
    await expect(page.getByRole('heading', { level: 1, name: 'Hồ sơ của bạn' })).toBeVisible();
  });

  test(bt('browser:auth-account', 'auth-submit-lock'), async ({ page }) => {
    let releaseLogin!: () => void;
    const loginReleased = new Promise<void>((resolve) => {
      releaseLogin = resolve;
    });
    let loginMutations = 0;
    await page.route('**/api/v1/auth/login', async (route) => {
      loginMutations += 1;
      await loginReleased;
      await route.continue();
    });

    await page.goto('/login');
    await page.locator('#email').fill(BROWSER_RESET_ACCOUNT.email);
    await page.locator('#password').fill(BROWSER_RESET_ACCOUNT.newPassword);
    const form = page.locator('form');
    const submit = form.locator('button[type="submit"]');
    const firstSubmit = submit.click();

    await expect(form).toHaveAttribute('aria-busy', 'true');
    await expect(submit).toBeDisabled();
    await expect(page.locator('#email')).toBeDisabled();
    await expect(page.locator('#password')).toBeDisabled();
    await page.locator('#password').press('Enter');
    await submit.evaluate((button: HTMLButtonElement) => {
      button.click();
    });
    await expect.poll(() => loginMutations).toBe(1);

    releaseLogin();
    await firstSubmit;
    await page.waitForURL('/account');
    expect(loginMutations).toBe(1);
  });

  test(bt('browser:auth-account', 'one-time-token-invalid'), async ({ page }) => {
    let oneTimeMutations = 0;
    page.on('request', (request) => {
      if (
        request.method() === 'POST' &&
        ['/api/v1/auth/reset-password', '/api/v1/auth/accept-employee-invitation'].includes(
          apiPath(request.url()),
        )
      ) {
        oneTimeMutations += 1;
      }
    });

    for (const path of [
      '/reset-password',
      '/reset-password#token=invalid',
      '/accept-invitation',
      '/accept-invitation#token=invalid',
    ]) {
      await page.goto(path);
      await expectFragmentTokenCleared(page, 'invalid');
      await expect(page.locator('#password')).toHaveCount(0);
      await page.locator('body').press('Enter');
    }
    expect(oneTimeMutations).toBe(0);

    const unknownToken = 'unknown-one-time-token-1234567890';
    for (const flow of [
      {
        path: `/reset-password#token=${unknownToken}`,
        action: 'Đổi mật khẩu',
        endpoint: '/api/v1/auth/reset-password',
        terminal: 'Liên kết không dùng được',
      },
      {
        path: `/accept-invitation#token=${unknownToken}`,
        action: 'Kích hoạt tài khoản',
        endpoint: '/api/v1/auth/accept-employee-invitation',
        terminal: 'Lời mời không dùng được',
      },
    ] as const) {
      await page.goto(flow.path);
      await expectFragmentTokenCleared(page, unknownToken);
      await page.locator('#password').fill('UnknownToken123');
      await page.locator('#confirmation').fill('UnknownToken123');
      const response = page.waitForResponse(
        (candidate) =>
          apiPath(candidate.url()) === flow.endpoint && candidate.request().method() === 'POST',
      );
      await page.getByRole('button', { name: flow.action, exact: true }).click();
      expect((await response).status()).not.toBe(204);
      await expect(page.getByText(flow.terminal, { exact: true })).toBeVisible();
      await expect(page.locator('#password')).toHaveCount(0);
      const mutationCount = oneTimeMutations;
      await page.locator('body').press('Enter');
      expect(oneTimeMutations).toBe(mutationCount);
    }
    expect(oneTimeMutations).toBe(2);
  });

  test(bt('browser:auth-account', 'registration-enumeration'), async ({ page }) => {
    await page.goto('/register');
    await page.locator('#fullName').fill('Khách đăng ký trùng');
    await page.locator('#email').fill(BROWSER_RESET_ACCOUNT.email);
    await page.locator('#password').fill('BrowserDuplicate123');
    await page.locator('#confirmation').fill('BrowserDuplicate123');
    const responsePromise = page.waitForResponse(
      (response) =>
        apiPath(response.url()) === '/api/v1/auth/register' &&
        response.request().method() === 'POST',
    );
    await page.getByRole('button', { name: 'Tạo tài khoản', exact: true }).click();
    const response = await responsePromise;
    expect(response.status()).toBe(201);
    const responseText = await response.text();
    expect(responseText).not.toContain(BROWSER_RESET_ACCOUNT.email);
    expect(responseText).not.toContain('DUPLICATE_RESOURCE');
    await expect(page.getByText('Đã tiếp nhận yêu cầu', { exact: true })).toBeVisible();
  });

  test(bt('browser:auth-account', 'auth-route-state-matrix'), async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/login');
    await page.locator('#email').press('Enter');
    const summary = page.getByRole('alert').filter({ hasText: 'Kiểm tra lại thông tin' });
    await expect(summary).toBeFocused();
    await expect(page.locator('#email')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('#password')).toHaveAttribute('aria-invalid', 'true');

    await page.locator('#email').fill('keyboard-customer@rephone.local');
    await expect(page.locator('#email')).not.toHaveAttribute('aria-invalid', 'true');
    await expect(summary.getByRole('link', { name: /email/i })).toHaveCount(0);

    const password = page.locator('#password');
    const toggle = page.getByRole('button', { name: 'Hiện mật khẩu', exact: true });
    await toggle.click();
    await expect(password).toHaveAttribute('type', 'text');
    const hidePassword = page.getByRole('button', { name: 'Ẩn mật khẩu', exact: true });
    await expect(hidePassword).toHaveAttribute('aria-pressed', 'true');
    await hidePassword.click();
    await expect(password).toHaveAttribute('type', 'password');
    await expectNoHorizontalOverflow(page);
    await expectNoSeriousAccessibilityViolations(page, '/login error (390px)');
    await stabilizeVisualPage(page);
    await expect(page).toHaveScreenshot('fe2-login-error-mobile-390.png', {
      animations: 'disabled',
      caret: 'hide',
      fullPage: true,
    });

    for (const route of [
      { path: '/register', heading: 'Tạo tài khoản' },
      { path: '/forgot-password', heading: 'Quên mật khẩu' },
      { path: '/reset-password', heading: 'Đặt mật khẩu mới' },
      { path: '/accept-invitation', heading: 'Kích hoạt tài khoản nhân viên' },
    ] as const) {
      await page.goto(route.path);
      await expect(page.getByRole('heading', { level: 1, name: route.heading })).toBeVisible();
      await expectNoHorizontalOverflow(page);
      await expectNoSeriousAccessibilityViolations(page, `${route.path} (390px)`);
    }
  });

  test(bt('browser:auth-account', 'staff-invitation'), async ({ page }) => {
    await page.goto(
      `/accept-invitation#token=${encodeURIComponent(BROWSER_INVITATION_ACCOUNT.token)}`,
    );

    await expect(
      page.getByRole('heading', { level: 1, name: 'Kích hoạt tài khoản nhân viên' }),
    ).toBeVisible();
    await expect(page.locator('#password')).toBeVisible();
    await expectFragmentTokenCleared(page, BROWSER_INVITATION_ACCOUNT.token);

    await page.locator('#password').fill(BROWSER_INVITATION_ACCOUNT.password);
    await page.locator('#confirmation').fill(BROWSER_INVITATION_ACCOUNT.password);

    const invitationResponse = page.waitForResponse(
      (response) =>
        apiPath(response.url()) === '/api/v1/auth/accept-employee-invitation' &&
        response.request().method() === 'POST',
    );
    await page.getByRole('button', { name: 'Kích hoạt tài khoản', exact: true }).click();
    expect((await invitationResponse).status()).toBe(204);

    await expect(page.getByText('Tài khoản đã được kích hoạt', { exact: true })).toBeVisible();
    await expect(
      page.locator('div[tabindex="-1"]').filter({ hasText: 'Tài khoản đã được kích hoạt' }),
    ).toBeFocused();
    await expect(page).toHaveURL('/accept-invitation');
    await expectNoRefreshCookie(page);
    await expectNoBrowserAuthSecrets(page, BROWSER_INVITATION_ACCOUNT.token);

    await login(
      page,
      BROWSER_INVITATION_ACCOUNT.email,
      BROWSER_INVITATION_ACCOUNT.password,
      '/backoffice',
    );
    await expect(page.getByRole('heading', { level: 1, name: 'Tổng quan vận hành' })).toBeVisible();

    let addressRequests = 0;
    page.on('request', (request) => {
      if (apiPath(request.url()) === '/api/v1/account/addresses') addressRequests += 1;
    });
    await page.goto('/account/addresses');
    await expect(page.getByText('Khu vực dành cho khách hàng', { exact: true })).toBeVisible();
    expect(addressRequests).toBe(0);

    await page.goto('/');
    await expect(page.getByRole('link', { name: 'Quản trị', exact: true })).toHaveAttribute(
      'href',
      '/backoffice',
    );

    await page.setViewportSize({ width: 320, height: 568 });
    await page.getByRole('button', { name: 'Mở danh mục', exact: true }).click();
    await expect(
      page.getByRole('link', { name: 'Mở trang quản trị', exact: true }),
    ).toHaveAttribute('href', '/backoffice');
  });

  test(bt('browser:auth-account', 'account-lifecycle'), async ({ page }) => {
    await page.goto('/register');
    await expect(page.getByRole('heading', { level: 1, name: 'Tạo tài khoản' })).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await expectNoSeriousAccessibilityViolations(page, '/register');

    await page.locator('#fullName').fill(BROWSER_CUSTOMER.fullName);
    await page.locator('#email').fill(BROWSER_CUSTOMER.email);
    await page.locator('#phone').fill(BROWSER_CUSTOMER.phone);
    await page.locator('#password').fill(BROWSER_CUSTOMER.password);
    await page.locator('#confirmation').fill(BROWSER_CUSTOMER.password);

    const registerResponse = page.waitForResponse(
      (response) =>
        apiPath(response.url()) === '/api/v1/auth/register' &&
        response.request().method() === 'POST',
    );
    await page.getByRole('button', { name: 'Tạo tài khoản', exact: true }).click();
    expect((await registerResponse).status()).toBe(201);

    await expect(page.getByText('Tài khoản đã được tạo', { exact: true })).toBeVisible();
    await expect(
      page.locator('div[tabindex="-1"]').filter({ hasText: 'Tài khoản đã được tạo' }),
    ).toBeFocused();
    await expect(page).toHaveURL('/register');
    await expectNoRefreshCookie(page);

    await login(
      page,
      BROWSER_CUSTOMER.email,
      BROWSER_CUSTOMER.password,
      '/account/addresses',
      '/login?returnTo=%2Faccount%2Faddresses',
    );
    await expect(page.getByRole('heading', { level: 1, name: 'Sổ địa chỉ' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Tài khoản', exact: true })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    await expectRefreshCookie(page);
    await expectNoBrowserAuthSecrets(page);

    const refreshRequestPromise = page.waitForRequest(isRefreshRequest);
    await page.reload();
    const refreshRequest = await refreshRequestPromise;
    await expectCookieMutationRequest(refreshRequest, true);
    await expect(page.getByRole('heading', { level: 1, name: 'Sổ địa chỉ' })).toBeVisible();
    await expect(page.getByText('Chưa có địa chỉ đã lưu', { exact: true })).toBeVisible();

    await expectCustomerAccountPopupAndBalancedNavigation(page);

    await page.goto('/account');
    await expect(page.getByRole('heading', { level: 1, name: 'Hồ sơ của bạn' })).toBeVisible();
    await expectAccountProfileFieldsAligned(page);
    await page.locator('#account-fullName').fill(BROWSER_CUSTOMER.updatedFullName);
    await page.locator('#account-phone').fill('0900000222');
    await page.getByRole('button', { name: 'Lưu thay đổi', exact: true }).click();
    await expect(page.getByText('Đã lưu hồ sơ', { exact: true })).toBeVisible();
    await expect(page.locator('#account-fullName')).toHaveValue(BROWSER_CUSTOMER.updatedFullName);

    await page.goto(CHECKOUT_INVENTORY_PATH);
    await expect(page.getByText('Ảnh thật · Mã máy IP13-BLU-001', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Thêm vào giỏ', exact: true }).click();
    await expect(page.getByText('Đã thêm vào giỏ hàng.', { exact: true })).toBeVisible();
    await page.goto('/checkout');
    await expect(page.getByRole('heading', { level: 1, name: 'Hoàn tất đơn hàng' })).toBeVisible();
    await expect(page.locator('#checkout-fullName')).toHaveValue(BROWSER_CUSTOMER.updatedFullName);
    await expect(page.locator('#checkout-phone')).toHaveValue('0900000222');

    await page.goto('/account/addresses');
    await expect(page.getByRole('heading', { level: 1, name: 'Sổ địa chỉ' })).toBeVisible();
    const addressNavigationCount = await page.evaluate(
      () => performance.getEntriesByType('navigation').length,
    );
    await createAddress(page, FIRST_ADDRESS, false, 'Thêm địa chỉ đầu tiên');
    await createAddress(page, SECOND_ADDRESS, true, 'Thêm địa chỉ');

    let firstCard = addressCard(page, FIRST_ADDRESS.label);
    let secondCard = addressCard(page, SECOND_ADDRESS.label);
    await expect(firstCard).toBeVisible();
    await expect(firstCard.getByText('Mặc định', { exact: true })).toHaveCount(0);
    await expect(secondCard.getByText('Mặc định', { exact: true })).toBeVisible();

    await firstCard.getByRole('button', { name: 'Sửa', exact: true }).click();
    await expect(page.getByRole('heading', { level: 2, name: 'Sửa địa chỉ' })).toBeVisible();
    await page.locator('#address-label').fill('Nhà Browser đã sửa');
    await page.locator('#address-isDefault').check();
    await submitAddressAndWaitForReload(page, 'Lưu địa chỉ');
    await expect(page.getByText('Đã cập nhật địa chỉ.', { exact: true })).toBeVisible();

    firstCard = addressCard(page, 'Nhà Browser đã sửa');
    secondCard = addressCard(page, SECOND_ADDRESS.label);
    await expect(firstCard.getByText('Mặc định', { exact: true })).toBeVisible();
    await expect(secondCard.getByText('Mặc định', { exact: true })).toHaveCount(0);

    await firstCard.getByRole('button', { name: 'Xóa', exact: true }).click();
    const archiveConfirmation = firstCard.getByRole('alert');
    await expect(archiveConfirmation).toBeFocused();
    const addressReload = page.waitForResponse(isSuccessfulAddressReload);
    await archiveConfirmation.getByRole('button', { name: 'Xác nhận xóa', exact: true }).click();
    await addressReload;
    await expect(addressCard(page, 'Nhà Browser đã sửa')).toHaveCount(0);
    await expect(addressCard(page, SECOND_ADDRESS.label)).toBeVisible();
    await expect(
      page.getByText('Đã xóa địa chỉ mặc định. Chưa có địa chỉ mặc định mới.'),
    ).toBeVisible();
    await expect(
      page
        .locator('[aria-live="polite"][tabindex="-1"]')
        .filter({ hasText: 'Đã xóa địa chỉ mặc định. Chưa có địa chỉ mặc định mới.' }),
    ).toBeFocused();
    await expect(
      addressCard(page, SECOND_ADDRESS.label).getByText('Mặc định', { exact: true }),
    ).toHaveCount(0);
    expect(await page.evaluate(() => performance.getEntriesByType('navigation').length)).toBe(
      addressNavigationCount,
    );

    let logoutAttempts = 0;
    await page.route('**/api/v1/auth/logout', async (route) => {
      logoutAttempts += 1;
      if (logoutAttempts === 1) {
        await route.abort('failed');
        return;
      }
      await route.continue();
    });
    const logoutRequestPromise = page.waitForRequest(isLogoutRequest);
    await page.getByRole('button', { name: 'Đăng xuất', exact: true }).click();
    const logoutRequest = await logoutRequestPromise;
    await expectCookieMutationRequest(logoutRequest, true);
    await expect(page.getByText('Chưa xác nhận được đăng xuất', { exact: true })).toBeVisible();
    await expectNoSeriousAccessibilityViolations(page, '/account logout warning');
    const retryLogoutRequest = page.waitForRequest(isLogoutRequest);
    await page.getByRole('button', { name: 'Thử đăng xuất lại', exact: true }).click();
    await retryLogoutRequest;
    await page.waitForURL('/login');
    expect(logoutAttempts).toBe(2);
    await expectNoRefreshCookie(page);

    await login(
      page,
      BROWSER_CUSTOMER.email,
      BROWSER_CUSTOMER.password,
      '/account/security',
      '/login?returnTo=%2Faccount%2Fsecurity',
    );
    await expect(page.getByRole('heading', { level: 1, name: 'Bảo mật' })).toBeVisible();
    await page.locator('#password-currentPassword').fill(BROWSER_CUSTOMER.password);
    await page.locator('#password-newPassword').fill(BROWSER_CUSTOMER.newPassword);
    await page.locator('#password-confirmation').fill(BROWSER_CUSTOMER.newPassword);

    const passwordResponse = page.waitForResponse(
      (response) =>
        apiPath(response.url()) === '/api/v1/account/change-password' &&
        response.request().method() === 'POST',
    );
    await page.getByRole('button', { name: 'Đổi mật khẩu', exact: true }).click();
    expect((await passwordResponse).status()).toBe(204);
    await expect(page.getByText('Đã đổi mật khẩu', { exact: true })).toBeVisible();
    await expectNoRefreshCookie(page);

    await page.goto('/account');
    await expect(
      page.getByRole('heading', { level: 2, name: 'Đăng nhập để quản lý tài khoản' }),
    ).toBeVisible();

    await page.goto('/login');
    await page.locator('#email').fill(BROWSER_CUSTOMER.email);
    await page.locator('#password').fill(BROWSER_CUSTOMER.password);
    await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
    await expect(page.getByText('Email hoặc mật khẩu không đúng.', { exact: true })).toBeVisible();

    await page.locator('#password').fill(BROWSER_CUSTOMER.newPassword);
    await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
    await page.waitForURL('/account');
    await expect(page.getByRole('heading', { level: 1, name: 'Hồ sơ của bạn' })).toBeVisible();
    await expectNoBrowserAuthSecrets(page);

    await page.setViewportSize({ width: 390, height: 844 });
    for (const route of [
      { path: '/account', heading: 'Hồ sơ của bạn' },
      { path: '/account/addresses', heading: 'Sổ địa chỉ' },
      { path: '/account/security', heading: 'Bảo mật' },
    ] as const) {
      await page.goto(route.path);
      await expect(page.getByRole('heading', { level: 1, name: route.heading })).toBeVisible();
      await expectNoHorizontalOverflow(page);
      await expectNoSeriousAccessibilityViolations(page, `${route.path} (390px)`);
    }

    await page.setViewportSize({ width: 320, height: 844 });
    await page.goto('/account/security');
    await expect(page.getByRole('heading', { level: 1, name: 'Bảo mật' })).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test(bt('browser:auth-account', 'account-load-recovery'), async ({ page }) => {
    const registration = await page.request.post('http://localhost:4001/api/v1/auth/register', {
      data: BROWSER_RECOVERY_CUSTOMER,
    });
    expect(registration.status()).toBe(201);

    let releaseProfileFailure!: () => void;
    const profileFailureGate = new Promise<void>((resolve) => {
      releaseProfileFailure = resolve;
    });
    let failProfile = true;
    await page.route('**/api/v1/account', async (route) => {
      if (route.request().method() === 'GET' && failProfile) {
        await profileFailureGate;
        await route.abort('failed');
        return;
      }
      await route.continue();
    });

    await login(
      page,
      BROWSER_RECOVERY_CUSTOMER.email,
      BROWSER_RECOVERY_CUSTOMER.password,
      '/account',
    );
    await expect(page.getByRole('status', { name: 'Đang tải hồ sơ tài khoản' })).toBeVisible();
    releaseProfileFailure();
    await expect(page.getByText('Chưa tải được dữ liệu', { exact: true })).toBeVisible();
    failProfile = false;
    await page.getByRole('button', { name: 'Thử lại', exact: true }).click();
    await expect(page.locator('#account-fullName')).toHaveValue(BROWSER_RECOVERY_CUSTOMER.fullName);

    await page.unroute('**/api/v1/account');
    let releaseProfileUpdate!: () => void;
    const profileUpdateGate = new Promise<void>((resolve) => {
      releaseProfileUpdate = resolve;
    });
    let profileMutations = 0;
    await page.route('**/api/v1/account', async (route) => {
      if (route.request().method() === 'PATCH') {
        profileMutations += 1;
        await profileUpdateGate;
      }
      await route.continue();
    });
    const navigationCount = await page.evaluate(
      () => performance.getEntriesByType('navigation').length,
    );
    await page.locator('#account-fullName').fill('Khách phục hồi đã cập nhật');
    const profileForm = page.getByRole('region', { name: 'Thông tin liên hệ' }).locator('form');
    await profileForm.evaluate((form) => {
      form.dispatchEvent(new SubmitEvent('submit', { bubbles: true, cancelable: true }));
      form.dispatchEvent(new SubmitEvent('submit', { bubbles: true, cancelable: true }));
    });
    await expect(profileForm).toHaveAttribute('aria-busy', 'true');
    await expect.poll(() => profileMutations).toBe(1);
    releaseProfileUpdate();
    await expect(page.getByText('Đã lưu hồ sơ', { exact: true })).toBeVisible();
    expect(profileMutations).toBe(1);
    expect(await page.evaluate(() => performance.getEntriesByType('navigation').length)).toBe(
      navigationCount,
    );
    await stabilizeVisualPage(page);
    await expect(page).toHaveScreenshot('fe2-account-profile-success-desktop.png', {
      animations: 'disabled',
      caret: 'hide',
      fullPage: true,
    });

    await page.unroute('**/api/v1/account');
    let failAddresses = true;
    await page.route('**/api/v1/account/addresses', async (route) => {
      if (route.request().method() === 'GET' && failAddresses) {
        await route.abort('failed');
        return;
      }
      await route.continue();
    });
    await page.goto('/account/addresses');
    await expect(page.getByText('Chưa tải được dữ liệu', { exact: true })).toBeVisible();
    failAddresses = false;
    await page.getByRole('button', { name: 'Thử lại', exact: true }).click();
    await expect(page.getByText('Chưa có địa chỉ đã lưu', { exact: true })).toBeVisible();
  });

  test(bt('browser:auth-account', 'forgot-password-enumeration'), async ({ page }) => {
    const knownResponse = await submitForgotPassword(page, BROWSER_RESET_ACCOUNT.email);
    const unknownResponse = await submitForgotPassword(
      page,
      'missing-browser-account@rephone.local',
    );

    expect(knownResponse).toContain('Nếu thông tin phù hợp');
    expect(unknownResponse).toBe(knownResponse);
  });
});

async function login(
  page: Page,
  email: string,
  password: string,
  expectedPath: string,
  loginPath = '/login',
): Promise<void> {
  await page.goto(loginPath);
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await page.waitForURL(expectedPath);
}

async function createAddress(
  page: Page,
  address: typeof FIRST_ADDRESS | typeof SECOND_ADDRESS,
  isDefault: boolean,
  openButton: 'Thêm địa chỉ' | 'Thêm địa chỉ đầu tiên',
): Promise<void> {
  await page.getByRole('button', { name: openButton, exact: true }).click();
  await page.locator('#address-label').fill(address.label);
  await page.locator('#address-receiverName').fill(address.receiverName);
  await page.locator('#address-phone').fill(address.phone);
  await page.locator('#address-postalCode').fill(address.postalCode);
  await page.locator('#address-addressLine').fill(address.addressLine);
  await page.locator('#address-ward').fill(address.ward);
  await page.locator('#address-district').fill(address.district);
  await page.locator('#address-province').fill(address.province);
  await page.locator('#address-isDefault').setChecked(isDefault);
  await submitAddressAndWaitForReload(page, 'Thêm địa chỉ');
  await expect(page.getByText('Đã thêm địa chỉ mới.', { exact: true })).toBeVisible();
  await expect(addressCard(page, address.label)).toBeVisible();
}

async function submitAddressAndWaitForReload(
  page: Page,
  action: 'Lưu địa chỉ' | 'Thêm địa chỉ',
): Promise<void> {
  const addressReload = page.waitForResponse(isSuccessfulAddressReload);
  await page.getByRole('button', { name: action, exact: true }).click();
  await addressReload;
}

function addressCard(page: Page, label: string) {
  return page.locator('article').filter({ hasText: label });
}

async function submitForgotPassword(page: Page, email: string): Promise<string> {
  await page.goto('/forgot-password');
  await page.locator('#email').fill(email);
  const responsePromise = page.waitForResponse(
    (response) =>
      apiPath(response.url()) === '/api/v1/auth/forgot-password' &&
      response.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Gửi liên kết', exact: true }).click();
  expect((await responsePromise).status()).toBe(202);
  const message = page.getByRole('status');
  await expect(message).toBeVisible();
  await expect(page.locator('div[tabindex="-1"]').filter({ has: message })).toBeFocused();
  return (await message.innerText()).replace(/\s+/g, ' ').trim();
}

async function expectFragmentTokenCleared(page: Page, oneTimeToken: string): Promise<void> {
  await expect
    .poll(() => {
      const url = new URL(page.url());
      return { hash: url.hash, tokenInQuery: url.searchParams.has('token') };
    })
    .toEqual({ hash: '', tokenInQuery: false });
  await expectNoBrowserAuthSecrets(page, oneTimeToken);
}

async function expectNoBrowserAuthSecrets(page: Page, oneTimeToken?: string): Promise<void> {
  const result = await page.evaluate((token) => {
    const entries = [localStorage, sessionStorage].flatMap((storage) =>
      Array.from({ length: storage.length }, (_, index) => {
        const key = storage.key(index) ?? '';
        return [key, storage.getItem(key) ?? ''] as const;
      }),
    );
    const authPattern =
      /(?:access|refresh|bearer|auth)[-_ ]?token|eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+\./i;
    return {
      hasAuthShapedStorage: entries.some(([key, value]) => authPattern.test(`${key}:${value}`)),
      hasOneTimeTokenInHtml:
        token !== undefined && document.documentElement.outerHTML.includes(token),
      hasOneTimeTokenInStorage:
        token !== undefined && entries.some(([, value]) => value.includes(token)),
      hash: window.location.hash,
      tokenInQuery: new URL(window.location.href).searchParams.has('token'),
    };
  }, oneTimeToken);

  expect(result).toEqual({
    hasAuthShapedStorage: false,
    hasOneTimeTokenInHtml: false,
    hasOneTimeTokenInStorage: false,
    hash: '',
    tokenInQuery: false,
  });
}

async function expectRefreshCookie(page: Page): Promise<void> {
  const cookie = (await page.context().cookies()).find(({ name }) => name === 'rephone_refresh');
  expect(cookie).toMatchObject({ httpOnly: true, name: 'rephone_refresh', path: '/api/v1/auth' });
}

async function expectNoRefreshCookie(page: Page): Promise<void> {
  const hasRefreshCookie = (await page.context().cookies()).some(
    ({ name }) => name === 'rephone_refresh',
  );
  expect(hasRefreshCookie).toBe(false);
}

async function expectCookieMutationRequest(
  request: Request,
  expectRefreshCookieHeader: boolean,
): Promise<void> {
  expect(await request.headerValue('x-rephone-csrf')).toBe('1');
  const cookie = await request.headerValue('cookie');
  if (expectRefreshCookieHeader) expect(cookie).toContain('rephone_refresh=');
}

function isRefreshRequest(request: Request): boolean {
  return request.method() === 'POST' && apiPath(request.url()) === '/api/v1/auth/refresh';
}

function isLogoutRequest(request: Request): boolean {
  return request.method() === 'POST' && apiPath(request.url()) === '/api/v1/auth/logout';
}

function isSuccessfulAddressReload(response: {
  request(): Request;
  status(): number;
  url(): string;
}) {
  return (
    response.request().method() === 'GET' &&
    apiPath(response.url()) === '/api/v1/account/addresses' &&
    response.status() === 200
  );
}

function apiPath(url: string): string {
  return new URL(url).pathname;
}

async function expectAccountProfileFieldsAligned(page: Page): Promise<void> {
  const fullNameLabel = page.locator('label[for="account-fullName"]');
  const phoneLabel = page.locator('label[for="account-phone"]');
  const fullNameInput = page.locator('#account-fullName');
  const phoneInput = page.locator('#account-phone');

  const [fullNameLabelBox, phoneLabelBox, fullNameInputBox, phoneInputBox] = await Promise.all([
    visibleBox(fullNameLabel),
    visibleBox(phoneLabel),
    visibleBox(fullNameInput),
    visibleBox(phoneInput),
  ]);
  expect(Math.abs(fullNameLabelBox.y - phoneLabelBox.y)).toBeLessThanOrEqual(1);
  expect(Math.abs(fullNameInputBox.y - phoneInputBox.y)).toBeLessThanOrEqual(1);
  expect(Math.abs(fullNameInputBox.height - phoneInputBox.height)).toBeLessThanOrEqual(1);

  await page.setViewportSize({ width: 390, height: 844 });
  const [mobileFullNameBox, mobilePhoneBox] = await Promise.all([
    visibleBox(fullNameInput),
    visibleBox(phoneInput),
  ]);
  expect(mobilePhoneBox.y).toBeGreaterThan(mobileFullNameBox.y + mobileFullNameBox.height);
  expect(Math.abs(mobileFullNameBox.x - mobilePhoneBox.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(mobileFullNameBox.width - mobilePhoneBox.width)).toBeLessThanOrEqual(1);
  await expectNoHorizontalOverflow(page);

  await page.setViewportSize({ width: 1280, height: 720 });
}

async function expectCustomerAccountPopupAndBalancedNavigation(page: Page): Promise<void> {
  const currentHeaderNavigation = page
    .locator("[data-shell='customer'] > header")
    .getByRole('navigation', { name: 'Điều hướng chính' });
  for (const label of ['Bảo hành', 'Ưa thích', 'Đơn hàng']) {
    await expect(
      currentHeaderNavigation.getByRole('link', { name: label, exact: true }),
    ).toHaveCount(0);
  }

  const accountButton = page.getByRole('button', { name: 'Tài khoản', exact: true });
  await accountButton.click();
  const accountMenu = page.getByRole('navigation', { name: 'Tùy chọn tài khoản' });
  await expect(accountMenu).toBeVisible();
  await expect(accountMenu.getByRole('link')).toHaveCount(4);
  for (const [label, href] of [
    ['Quản lý tài khoản', '/account'],
    ['Bảo hành', '/warranties'],
    ['Ưa thích', '/wishlist'],
    ['Đơn hàng', '/orders'],
  ] as const) {
    await expect(accountMenu.getByRole('link', { name: label, exact: true })).toHaveAttribute(
      'href',
      href,
    );
  }

  await page.keyboard.press('Escape');
  await expect(accountMenu).toHaveCount(0);
  await expect(accountButton).toBeFocused();

  await accountButton.press('ArrowDown');
  await expect(accountMenu).toBeVisible();
  await expect(
    accountMenu.getByRole('link', { name: 'Quản lý tài khoản', exact: true }),
  ).toBeFocused();
  await page.keyboard.press('Escape');

  await accountButton.click();
  await expect(accountMenu).toBeVisible();
  await page.locator('main').click({ position: { x: 1, y: 1 } });
  await expect(accountMenu).toHaveCount(0);

  await page.goto('/store');

  for (const width of [1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const header = page.locator("[data-shell='storefront'] > header");
    const navigation = header.getByRole('navigation', { name: 'Điều hướng chính' });
    const publicNavigationList = navigation.locator('ul');

    await expect(publicNavigationList).toHaveCount(1);
    await expect(publicNavigationList.locator('li')).toHaveCount(5);

    for (const label of ['Bảo hành', 'Ưa thích', 'Đơn hàng']) {
      await expect(navigation.getByRole('link', { name: label, exact: true })).toHaveCount(0);
    }
    await expect(navigation.getByRole('link', { name: 'Liên hệ', exact: true })).toHaveAttribute(
      'aria-current',
      'page',
    );

    const [navigationBox, publicNavigationBox] = await Promise.all([
      visibleBox(navigation),
      visibleBox(publicNavigationList),
    ]);
    expect(
      Math.abs(
        navigationBox.x +
          navigationBox.width / 2 -
          (publicNavigationBox.x + publicNavigationBox.width / 2),
      ),
    ).toBeLessThanOrEqual(1);

    const itemGeometry = await publicNavigationList.locator('li').evaluateAll((items) => ({
      gaps: items.slice(1).map((item, index) => {
        const previous = items[index]?.getBoundingClientRect();
        const current = item.getBoundingClientRect();
        return previous === undefined ? 0 : current.left - previous.right;
      }),
      tops: items.map((item) => item.getBoundingClientRect().top),
    }));
    expect(Math.max(...itemGeometry.gaps) - Math.min(...itemGeometry.gaps)).toBeLessThanOrEqual(1);
    expect(Math.max(...itemGeometry.tops) - Math.min(...itemGeometry.tops)).toBeLessThanOrEqual(1);
  }

  await page.setViewportSize({ width: 320, height: 568 });
  await expectNoHorizontalOverflow(page);
  await page.getByRole('button', { name: 'Mở danh mục', exact: true }).click();
  const mobileDialog = page.getByRole('dialog', { name: 'Danh mục', exact: true });
  const mobileCustomerNavigation = page.getByRole('navigation', {
    name: 'Lối tắt tài khoản',
  });
  for (const label of ['Bảo hành', 'Ưa thích', 'Đơn hàng']) {
    await expect(
      mobileCustomerNavigation.getByRole('link', { name: label, exact: true }),
    ).toBeVisible();
  }

  const scrollState = await mobileDialog.evaluate((element) => ({
    clientHeight: element.clientHeight,
    overflowY: getComputedStyle(element).overflowY,
    scrollHeight: element.scrollHeight,
  }));
  expect(scrollState.overflowY).toBe('auto');
  expect(scrollState.scrollHeight).toBeGreaterThan(scrollState.clientHeight);
  await expectNoHorizontalOverflow(page);

  const cartLink = mobileDialog.getByRole('link', { name: /Giỏ hàng/ });
  await cartLink.scrollIntoViewIfNeeded();
  await expect(cartLink).toBeInViewport();
  await page.getByRole('button', { name: 'Đóng', exact: true }).click();

  await page.setViewportSize({ width: 1280, height: 720 });
}

async function visibleBox(
  locator: Locator,
): Promise<NonNullable<Awaited<ReturnType<Locator['boundingBox']>>>> {
  const box = await locator.boundingBox();
  if (box === null)
    throw new Error(`Expected ${locator.toString()} to have a visible bounding box`);
  return box;
}

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
}

async function expectNoSeriousAccessibilityViolations(page: Page, route: string): Promise<void> {
  const results = await new AxeBuilder({ page })
    .exclude('nextjs-portal')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze();
  const violations = results.violations
    .filter(({ impact }) => impact === 'serious' || impact === 'critical')
    .map(({ id, impact, nodes }) => ({
      id,
      impact,
      nodes: nodes.length,
      route,
      targets: nodes.map(({ target }) => target),
    }));

  expect(violations).toEqual([]);
}
