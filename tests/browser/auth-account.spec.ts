import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page, type Request } from '@playwright/test';
import {
  BROWSER_INVITATION_ACCOUNT,
  BROWSER_RESET_ACCOUNT,
} from '../../apps/api/test/browser/auth-fixtures';

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

test.describe('FE-2 authentication and account', () => {
  test.describe.configure({ mode: 'serial' });

  test('consumes a reset token from the fragment before submitting it', async ({ page }) => {
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

    await expect(page.getByText('Mật khẩu đã được cập nhật', { exact: true })).toBeVisible();
    await expectNoRefreshCookie(page);
    await expectNoBrowserAuthSecrets(page, BROWSER_RESET_ACCOUNT.token);

    await login(page, BROWSER_RESET_ACCOUNT.email, BROWSER_RESET_ACCOUNT.newPassword, '/account');
    await expect(page.getByRole('heading', { level: 1, name: 'Hồ sơ của bạn' })).toBeVisible();
  });

  test('consumes an employee invitation without auto-login and uses the staff destination', async ({
    page,
  }) => {
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
    await expect(page).toHaveURL('/accept-invitation');
    await expectNoRefreshCookie(page);
    await expectNoBrowserAuthSecrets(page, BROWSER_INVITATION_ACCOUNT.token);

    await login(
      page,
      BROWSER_INVITATION_ACCOUNT.email,
      BROWSER_INVITATION_ACCOUNT.password,
      '/backoffice/orders',
    );
    await expect(page.getByRole('heading', { level: 1, name: 'Vận hành đơn hàng' })).toBeVisible();
  });

  test('runs the customer session, profile, address and password lifecycle', async ({ page }) => {
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
    await expect(page.getByRole('link', { name: 'Tài khoản', exact: true })).toHaveAttribute(
      'href',
      '/account',
    );
    await expectRefreshCookie(page);
    await expectNoBrowserAuthSecrets(page);

    const refreshRequestPromise = page.waitForRequest(isRefreshRequest);
    await page.reload();
    const refreshRequest = await refreshRequestPromise;
    await expectCookieMutationRequest(refreshRequest, true);
    await expect(page.getByRole('heading', { level: 1, name: 'Sổ địa chỉ' })).toBeVisible();
    await expect(page.getByText('Chưa có địa chỉ đã lưu', { exact: true })).toBeVisible();

    await page.goto('/account');
    await expect(page.getByRole('heading', { level: 1, name: 'Hồ sơ của bạn' })).toBeVisible();
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
    await expect(page.getByRole('heading', { level: 1, name: 'Checkout' })).toBeVisible();
    await expect(page.getByLabel('Họ tên', { exact: true })).toHaveValue(
      BROWSER_CUSTOMER.updatedFullName,
    );
    await expect(page.getByLabel('Điện thoại', { exact: true })).toHaveValue('0900000222');

    await page.goto('/account/addresses');
    await expect(page.getByRole('heading', { level: 1, name: 'Sổ địa chỉ' })).toBeVisible();
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

    const logoutRequestPromise = page.waitForRequest(isLogoutRequest);
    await page.getByRole('button', { name: 'Đăng xuất', exact: true }).click();
    const logoutRequest = await logoutRequestPromise;
    await expectCookieMutationRequest(logoutRequest, true);
    await page.waitForURL('/login');
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
  });

  test('keeps forgot-password responses enumeration-safe', async ({ page }) => {
    const knownResponse = await submitForgotPassword(page, BROWSER_RESET_ACCOUNT.email);
    const unknownResponse = await submitForgotPassword(
      page,
      'missing-browser-account@rephone.local',
    );

    expect(knownResponse).toContain('Nếu tài khoản phù hợp');
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
      hasOneTimeTokenInStorage:
        token !== undefined && entries.some(([, value]) => value.includes(token)),
      hash: window.location.hash,
      tokenInQuery: new URL(window.location.href).searchParams.has('token'),
    };
  }, oneTimeToken);

  expect(result).toEqual({
    hasAuthShapedStorage: false,
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
