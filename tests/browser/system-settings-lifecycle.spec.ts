import { expect, test, type Locator, type Page, type Route } from '@playwright/test';
import { browserTestTitle as bt } from '../../apps/web/lib/frontend-browser-coverage';

type PatchMode = 'conflict' | 'success';
type UploadMode = 'provider-error' | 'success';

interface SettingsProjection {
  bankAccountHolder: string;
  bankAccountNumber: string;
  bankName: string;
  bankQrUrl: string | null;
  createdAt: string;
  currency: 'VND';
  defaultShippingFee: string;
  defaultWarrantyDays: number;
  defaultWarrantyTerms: string;
  depositProofWindowMinutes: number;
  depositReviewWindowMinutes: number;
  pickupHoldMinutes: number;
  shippingDepositAmount: string;
  storeAddress: string;
  storeName: string;
  storePhone: string;
  timezone: 'Asia/Ho_Chi_Minh';
  updatedAt: string;
  updatedBy: { id: string; fullName: string } | null;
  version: number;
}

interface RequestGate {
  readonly promise: Promise<void>;
  release: () => void;
}

interface SettingsProbe {
  conflictUpdate: Partial<SettingsProjection>;
  getRequests: number;
  patchBodies: Array<Record<string, unknown>>;
  patchGate?: RequestGate;
  patchMode: PatchMode;
  settings: SettingsProjection;
  uploadGate?: RequestGate;
  uploadMode: UploadMode;
  uploadPayloads: string[];
}

test(bt('browser:system-admin-health', 'settings-conflict-rebase'), async ({ page }) => {
  const probe = await settingsFixture(page);
  await page.goto('/backoffice/settings');

  const storeName = page.getByLabel(/^Tên cửa hàng/);
  const storePhone = page.getByLabel(/^Số điện thoại/);
  const save = page.getByRole('button', { name: 'Lưu thay đổi', exact: true });
  await expect(page.getByRole('heading', { name: 'Cấu hình cửa hàng' })).toBeVisible();
  await expect(storeName).toHaveValue('rePhone FE09');

  probe.patchMode = 'conflict';
  probe.conflictUpdate = {
    storeName: 'rePhone từ máy chủ',
    storePhone: '0909000002',
  };
  await storeName.fill('rePhone do quản trị viên sửa');
  await submitTwiceSameFrame(save);

  await expect.poll(() => probe.patchBodies.length).toBe(1);
  await expect(page.getByText('Có thay đổi mới hơn', { exact: true })).toBeVisible();
  expect(probe.patchBodies[0]?.['expectedVersion']).toBe(1);
  await expect(storeName).toHaveValue('rePhone do quản trị viên sửa');
  await expect(storePhone).toHaveValue('0909000001');

  await page.getByRole('button', { name: 'Giữ các trường tôi đã sửa' }).click();
  await expect(storeName).toHaveValue('rePhone do quản trị viên sửa');
  await expect(storePhone).toHaveValue('0909000002');
  await expect(save).toBeEnabled();

  probe.patchGate = requestGate();
  await submitTwiceSameFrame(save);
  await expect.poll(() => probe.patchBodies.length).toBe(2);
  await expect(page.getByRole('button', { name: 'Đang lưu' })).toHaveAttribute('aria-busy', 'true');
  expect(probe.patchBodies[1]).toMatchObject({
    expectedVersion: 2,
    storeName: 'rePhone do quản trị viên sửa',
  });
  probe.patchGate.release();

  await expect(page.getByText('Đã lưu cấu hình cửa hàng.', { exact: true })).toBeVisible();
  await expect(storeName).toHaveValue('rePhone do quản trị viên sửa');
  expect(probe.patchBodies).toHaveLength(2);
  expect(probe.settings.version).toBe(3);

  probe.patchMode = 'conflict';
  probe.conflictUpdate = {
    storeName: 'rePhone bản mới nhất',
    storePhone: '0909000004',
  };
  await storeName.fill('Tên sẽ được bỏ');
  await save.click();

  await expect.poll(() => probe.patchBodies.length).toBe(3);
  await expect(page.getByText('Có thay đổi mới hơn', { exact: true })).toBeVisible();
  expect(probe.patchBodies[2]?.['expectedVersion']).toBe(3);
  await expect(storeName).toHaveValue('Tên sẽ được bỏ');

  await page.getByRole('button', { name: 'Dùng dữ liệu mới nhất' }).click();
  await expect(storeName).toHaveValue('rePhone bản mới nhất');
  await expect(storePhone).toHaveValue('0909000004');
  await expect(save).toBeDisabled();
  expect(probe.settings.version).toBe(4);
});

test(bt('browser:system-admin-health', 'settings-validation-focus'), async ({ page }) => {
  const probe = await settingsFixture(page);
  await page.goto('/backoffice/settings');

  const storeName = page.getByLabel(/^Tên cửa hàng/);
  await expect(storeName).toHaveValue('rePhone FE09');
  await storeName.fill('');
  await storeName.press('Enter');

  const summary = page.getByRole('alert').filter({ hasText: 'Kiểm tra lại thông tin' });
  await expect(summary).toBeFocused();
  await expect(storeName).toHaveAttribute('aria-invalid', 'true');
  expect(probe.patchBodies).toEqual([]);

  const fieldLink = summary.getByRole('link', { name: 'Nhập tên cửa hàng.' });
  await fieldLink.focus();
  await fieldLink.press('Enter');
  await expect(storeName).toBeFocused();

  await storeName.fill('rePhone FE09');
  await expect(summary).toHaveCount(0);
  await expect(storeName).not.toHaveAttribute('aria-invalid', 'true');
});

test(bt('browser:system-admin-health', 'settings-qr-lifecycle'), async ({ page }) => {
  const probe = await settingsFixture(page);
  await page.goto('/backoffice/settings');

  const picker = page.locator('label[for="settings-bank-qr"]');
  const fileInput = page.locator('#settings-bank-qr');
  const upload = page.getByRole('button', { name: 'Cập nhật ảnh QR', exact: true });
  await expect(page.getByRole('heading', { name: 'QR chuyển khoản' })).toBeVisible();
  await expect(picker).toBeVisible();
  await expect(picker).toContainText('Chọn ảnh QR mới');
  expect((await picker.boundingBox())?.height ?? 0).toBeGreaterThan(100);

  await fileInput.setInputFiles({
    buffer: Buffer.from('not-an-image'),
    mimeType: 'application/pdf',
    name: 'ma-qr-khong-hop-le.pdf',
  });
  await expect(picker).toContainText('ma-qr-khong-hop-le.pdf');
  await expect(page.getByText('Chỉ nhận ảnh JPEG, PNG hoặc WebP.', { exact: true })).toBeVisible();
  await expect(upload).toBeDisabled();
  expect(probe.uploadPayloads).toEqual([]);

  await fileInput.setInputFiles({
    buffer: Buffer.from('qr-fe09-provider'),
    mimeType: 'image/png',
    name: 'qr-fe09.png',
  });
  await expect(picker).toContainText('qr-fe09.png');
  await expect(upload).toBeEnabled();

  probe.uploadMode = 'provider-error';
  probe.uploadGate = requestGate();
  await submitTwiceSameFrame(upload);
  await expect.poll(() => probe.uploadPayloads.length).toBe(1);
  await expect(page.getByRole('button', { name: 'Đang cập nhật ảnh QR' })).toHaveAttribute(
    'aria-busy',
    'true',
  );
  probe.uploadGate.release();

  await expect(
    page.getByText('Kho lưu trữ đang tạm gián đoạn. Hãy thử lại.', { exact: true }),
  ).toBeVisible();
  await expect(picker).toContainText('qr-fe09.png');
  await expect(upload).toBeEnabled();
  expect(probe.uploadPayloads).toHaveLength(1);

  probe.uploadMode = 'success';
  probe.uploadGate = requestGate();
  await submitTwiceSameFrame(upload);
  await expect.poll(() => probe.uploadPayloads.length).toBe(2);
  await expect(page.getByRole('button', { name: 'Đang cập nhật ảnh QR' })).toHaveAttribute(
    'aria-busy',
    'true',
  );
  expect(probe.uploadPayloads[1]).toContain('name="expectedVersion"');
  expect(probe.uploadPayloads[1]).toContain('\r\n\r\n1\r\n');
  expect(probe.uploadPayloads[1]).toContain('filename="qr-fe09.png"');
  probe.uploadGate.release();

  await expect(page.getByText('Đã cập nhật ảnh QR chuyển khoản.', { exact: true })).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Xem ảnh QR đang dùng (mở trong thẻ mới)' }),
  ).toHaveAttribute('href', 'https://assets.example/qr-v2.png');
  await expect(picker).toContainText('Chọn ảnh QR mới');
  await expect(upload).toBeDisabled();
  expect(probe.uploadPayloads).toHaveLength(2);
  expect(probe.settings.version).toBe(2);
});

async function settingsFixture(page: Page): Promise<SettingsProbe> {
  const probe: SettingsProbe = {
    conflictUpdate: {},
    getRequests: 0,
    patchBodies: [],
    patchMode: 'success',
    settings: settingsProjection(),
    uploadMode: 'success',
    uploadPayloads: [],
  };

  await page.route('**/api/v1/auth/refresh', (route) =>
    json(route, {
      data: {
        accessToken: 'fe09-settings-admin',
        user: {
          email: 'admin@rephone.local',
          fullName: 'Quản trị FE09',
          id: '0199d011-0000-7000-8000-000000000001',
          phone: '0900000909',
          role: 'ADMIN',
          status: 'ACTIVE',
        },
      },
    }),
  );
  await page.route('**/api/v1/backoffice/settings**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const method = request.method();
    if (method === 'OPTIONS') return preflight(route);

    if (path === '/api/v1/backoffice/settings' && method === 'GET') {
      probe.getRequests += 1;
      return json(route, { data: probe.settings });
    }
    if (path === '/api/v1/backoffice/settings' && method === 'PATCH') {
      const body = request.postDataJSON() as Record<string, unknown>;
      probe.patchBodies.push(body);
      const gate = probe.patchGate;
      if (gate !== undefined) await gate.promise;
      await delay(100);

      if (probe.patchMode === 'conflict') {
        probe.settings = authoritativeSettings(probe.settings, probe.conflictUpdate);
        probe.patchMode = 'success';
        probe.conflictUpdate = {};
        return json(route, errorEnvelope('SETTINGS_VERSION_CONFLICT'), 409);
      }

      const changes = { ...body };
      delete changes['expectedVersion'];
      probe.settings = authoritativeSettings(probe.settings, changes);
      return json(route, { data: probe.settings });
    }
    if (path === '/api/v1/backoffice/settings/bank-qr' && method === 'POST') {
      probe.uploadPayloads.push(request.postData() ?? '');
      const gate = probe.uploadGate;
      if (gate !== undefined) await gate.promise;
      await delay(100);

      if (probe.uploadMode === 'provider-error') {
        return json(
          route,
          errorEnvelope('STORAGE_UNAVAILABLE', 'Kho lưu trữ đang tạm gián đoạn. Hãy thử lại.'),
          503,
        );
      }

      probe.settings = authoritativeSettings(probe.settings, {
        bankQrUrl: `https://assets.example/qr-v${String(probe.settings.version + 1)}.png`,
      });
      return json(route, { data: probe.settings });
    }

    return json(route, errorEnvelope('RESOURCE_NOT_FOUND'), 404);
  });
  return probe;
}

async function submitTwiceSameFrame(button: Locator): Promise<void> {
  await button.evaluate((element) => {
    const submitter = element as HTMLButtonElement;
    if (submitter.form === null) throw new Error('Expected a submit button inside a form');
    submitter.form.requestSubmit(submitter);
    submitter.form.requestSubmit(submitter);
  });
}

function authoritativeSettings(
  current: SettingsProjection,
  changes: Record<string, unknown> | Partial<SettingsProjection>,
): SettingsProjection {
  return {
    ...current,
    ...changes,
    updatedAt: '2026-09-02T07:00:00.000Z',
    updatedBy: {
      fullName: 'Quản trị FE09',
      id: '0199d011-0000-7000-8000-000000000001',
    },
    version: current.version + 1,
  };
}

function settingsProjection(): SettingsProjection {
  return {
    bankAccountHolder: 'REPHONE COMPANY',
    bankAccountNumber: '0123456789',
    bankName: 'Ngân hàng FE09',
    bankQrUrl: null,
    createdAt: '2026-08-01T02:00:00.000Z',
    currency: 'VND',
    defaultShippingFee: '30000',
    defaultWarrantyDays: 180,
    defaultWarrantyTerms: 'Bảo hành theo chính sách rePhone.',
    depositProofWindowMinutes: 60,
    depositReviewWindowMinutes: 120,
    pickupHoldMinutes: 1440,
    shippingDepositAmount: '500000',
    storeAddress: '123 Đường FE09, Thành phố Hồ Chí Minh',
    storeName: 'rePhone FE09',
    storePhone: '0909000001',
    timezone: 'Asia/Ho_Chi_Minh',
    updatedAt: '2026-09-01T02:00:00.000Z',
    updatedBy: null,
    version: 1,
  };
}

function requestGate(): RequestGate {
  let release = () => undefined;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

function errorEnvelope(code: string, message = `Lỗi giả lập ${code}`) {
  return {
    error: {
      code,
      details: [],
      message,
      requestId: `fe09-${code}`,
    },
  };
}

async function json(route: Route, body: unknown, status = 200) {
  await route.fulfill({
    body: JSON.stringify(body),
    contentType: 'application/json',
    headers: {
      'access-control-allow-credentials': 'true',
      'access-control-allow-origin': 'http://localhost:3001',
    },
    status,
  });
}

async function preflight(route: Route) {
  await route.fulfill({
    headers: {
      'access-control-allow-credentials': 'true',
      'access-control-allow-headers': 'authorization,content-type',
      'access-control-allow-methods': 'GET,PATCH,POST,OPTIONS',
      'access-control-allow-origin': 'http://localhost:3001',
    },
    status: 204,
  });
}

async function delay(milliseconds: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}
