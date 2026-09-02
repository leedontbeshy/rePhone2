import AxeBuilder from '@axe-core/playwright';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { expect, test, type Page, type Route } from '@playwright/test';
import { browserTestTitle as bt } from '../../apps/web/lib/frontend-browser-coverage';
import { stabilizeVisualPage } from './support/stabilize-visual-page';

const UNIT_ID = '0199d006-0000-7000-8000-000000000001';
const INSPECTION_ID = '0199d006-0000-7000-8000-000000000002';
const PRODUCT_ID = '0199d006-0000-7000-8000-000000000003';
const VARIANT_ID = '0199d006-0000-7000-8000-000000000004';
const STORE_ID = '0199d006-0000-7000-8000-000000000005';
const WAREHOUSE_ID = '0199d006-0000-7000-8000-000000000006';
const ACCESSORY_PRODUCT_ID = '0199d006-0000-7000-8000-000000000007';
const ACCESSORY_VARIANT_ID = '0199d006-0000-7000-8000-000000000008';
const STOCK_LEVEL_ID = '0199d006-0000-7000-8000-000000000009';
const STAFF_ID = '0199d006-0000-7000-8000-000000000010';
const RAW_IMEI = '490154203237518';
const PRODUCT_NAME = 'iPhone 15 Pro';
const ACCESSORY_NAME = 'Củ sạc USB-C 20W';

type StaffRole = 'ADMIN' | 'EMPLOYEE';
type InspectionStatus = 'DRAFT' | 'COMPLETED';
type InspectionType = 'INTAKE' | 'PRE_SALE' | 'WARRANTY' | 'RETURN';

interface Fe06ApiOptions {
  readonly inspectionType?: InspectionType;
  readonly lookupOutcome?: 'success' | 'not-found' | 'provider-error';
  readonly mediaCount?: number;
  readonly resumeDelayMs?: number;
}

interface MovementFixture {
  readonly createdAt: string;
  readonly id: string;
  readonly quantity: number;
  readonly reason: string;
  readonly type: 'ADJUSTMENT_IN' | 'RECEIPT';
}

interface Fe06Probe {
  costRequests: number;
  inspectionCompleteRequests: number;
  inspectionPatchBodies: Array<Record<string, unknown>>;
  inspectionStatus: InspectionStatus;
  inspectionType: InspectionType;
  inspectionValues: Record<string, unknown>;
  lookupBody: Record<string, unknown> | null;
  lookupRequests: Array<{ method: string; url: string }>;
  mediaCount: number;
  movements: MovementFixture[];
  stockCommandBodies: Array<{ body: Record<string, unknown>; path: string }>;
  stockLevelRequests: number;
  stockMovementRequests: number;
  stockQuantity: number;
  unitListQueries: string[];
}

const CHECKS = [
  ['DISPLAY', 'Màn hình hiển thị'],
  ['TOUCHSCREEN', 'Cảm ứng'],
  ['FRONT_CAMERA', 'Camera trước'],
  ['REAR_CAMERA', 'Camera sau'],
  ['FACE_ID_TOUCH_ID', 'Face ID hoặc Touch ID'],
  ['SPEAKER', 'Loa'],
  ['MICROPHONE', 'Micro'],
  ['BUTTONS', 'Phím vật lý'],
  ['VIBRATION_HAPTICS', 'Rung và phản hồi'],
  ['WIFI', 'Wi-Fi'],
  ['BLUETOOTH', 'Bluetooth'],
  ['CELLULAR', 'Sóng di động'],
  ['CHARGING_PORT', 'Cổng sạc'],
  ['WIRELESS_CHARGING', 'Sạc không dây'],
  ['BATTERY_FUNCTION', 'Hoạt động pin'],
  ['GPS_LOCATION', 'GPS và định vị'],
  ['SENSORS', 'Cảm biến'],
  ['CONNECTORS_OTHER', 'Kết nối khác'],
] as const;

test.describe('FE-06 inventory and stock workspace', () => {
  test(bt('browser:inventory-stock', 'employee-cost-privacy'), async ({ page }) => {
    const probe = await installFe06Api(page, 'EMPLOYEE');

    await page.goto(`/backoffice/inventory/units/${UNIT_ID}`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { level: 1, name: PRODUCT_NAME })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Mã định danh' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Giá vốn nội bộ' })).toHaveCount(0);
    await page.waitForTimeout(150);
    expect(probe.costRequests).toBe(0);

    const unitMediaInput = page.locator('#unit-media-file');
    const unitMediaPicker = unitMediaInput.locator('..');
    await page.emulateMedia({ forcedColors: 'active' });
    await unitMediaInput.focus();
    await expect(unitMediaPicker).toHaveCSS('outline-style', 'solid');
    await expect(unitMediaPicker).toHaveCSS('outline-width', '3px');
    await expect(unitMediaPicker.locator('span').first()).toHaveCSS('outline-style', 'none');
    await page.emulateMedia({ forcedColors: 'none' });

    const transferButton = page.getByRole('button', { name: 'Chuyển địa điểm', exact: true });
    await transferButton.click();
    const transferDialog = page.getByRole('dialog', {
      name: 'Chuyển máy sang địa điểm khác',
    });
    await expect(transferDialog).toBeVisible();
    await expectAccessible(page);
    await page.keyboard.press('Escape');
    await expect(transferDialog).toHaveCount(0);
    await expect(transferButton).toBeFocused();

    await expectSingleMainAndNoOverflow(page);

    await page.goto('/backoffice', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { level: 1, name: 'Tổng quan vận hành' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Cấu hình cửa hàng' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Trạng thái hệ thống' })).toHaveCount(0);
    await expectAccessible(page);
  });

  test(bt('browser:inventory-stock', 'identifier-lookup-post'), async ({ page }) => {
    const probe = await installFe06Api(page, 'EMPLOYEE');

    await page.goto('/backoffice/inventory/lookup', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { level: 1, name: 'Tra cứu mã máy' })).toBeVisible();
    await page.getByLabel('IMEI đầy đủ').fill(RAW_IMEI);
    await expect(page.getByLabel('Lý do tra cứu')).toHaveCount(0);
    await page.getByRole('button', { name: 'Tra cứu', exact: true }).click();

    await expect(page.getByRole('heading', { level: 2, name: PRODUCT_NAME })).toBeVisible();
    expect(probe.lookupBody).toEqual({
      type: 'IMEI',
      value: RAW_IMEI,
    });
    expect(new URL(page.url()).search).not.toContain(RAW_IMEI);
    await expect(page.getByLabel('IMEI đầy đủ')).toHaveValue('');
    expect(await page.locator('main').innerText()).not.toContain(RAW_IMEI);
    await expect(page.getByText('***********7518')).toBeVisible();
    expect(probe.lookupRequests).toHaveLength(1);
    expect(probe.lookupRequests[0]?.method).toBe('POST');
    expect(probe.lookupRequests[0]?.url).not.toContain(RAW_IMEI);

    for (const lookupOutcome of ['not-found', 'provider-error'] as const) {
      const isolated = await page.context().newPage();
      const isolatedProbe = await installFe06Api(isolated, 'EMPLOYEE', { lookupOutcome });
      await isolated.goto('/backoffice/inventory/lookup', { waitUntil: 'domcontentloaded' });
      const field = isolated.getByLabel('IMEI đầy đủ');
      await field.fill(RAW_IMEI);
      await isolated.getByRole('button', { name: 'Tra cứu', exact: true }).click();
      await expect(isolated.locator('main [role="alert"]')).toContainText(
        lookupOutcome === 'not-found' ? 'IMEI chưa khớp với máy nào' : 'Dịch vụ đang tạm gián đoạn',
      );
      await expectAccessible(isolated);
      await expect(field).toHaveValue('');
      expect(isolated.url()).not.toContain(RAW_IMEI);
      expect(isolatedProbe.lookupRequests[0]?.method).toBe('POST');
      expect(isolatedProbe.lookupRequests[0]?.url).not.toContain(RAW_IMEI);
      expect(await isolated.locator('body').innerText()).not.toContain(RAW_IMEI);
      await isolated.close();
    }
  });

  test(bt('browser:inventory-stock', 'unit-filter-no-reload'), async ({ page }) => {
    const browserErrors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') browserErrors.push(message.text());
    });
    page.on('pageerror', (error) => {
      browserErrors.push(error.message);
    });
    const probe = await installFe06Api(page, 'EMPLOYEE');

    await page.goto('/backoffice/inventory/units', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { level: 1, name: 'Danh sách máy' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Nhập máy', exact: true }).last()).toHaveCSS(
      'color',
      'rgb(255, 255, 255)',
    );
    const marker = await page.evaluate(() => {
      const value = `fe06-${String(Date.now())}`;
      (window as Window & { __fe06NavigationMarker?: string }).__fe06NavigationMarker = value;
      return value;
    });

    const search = page.getByRole('textbox', { name: 'Tìm máy' });
    await search.fill('iPhone 15');
    await expect
      .poll(() => probe.unitListQueries.some((query) => query.includes('q=iPhone+15')))
      .toBe(true);
    expect(
      await page.evaluate(
        () => (window as Window & { __fe06NavigationMarker?: string }).__fe06NavigationMarker,
      ),
    ).toBe(marker);

    await search.fill(RAW_IMEI);
    await expect(page.getByText(/IMEI, EID và số sê-ri chỉ được nhập tại/)).toBeVisible();
    await page.waitForTimeout(400);
    expect(decodeURIComponent(page.url())).not.toContain(RAW_IMEI);
    expect(probe.unitListQueries.join('\n')).not.toContain(RAW_IMEI);
    expect(
      await page.evaluate(
        () => (window as Window & { __fe06NavigationMarker?: string }).__fe06NavigationMarker,
      ),
    ).toBe(marker);
    expect(browserErrors).toEqual([]);
  });

  test(bt('browser:inventory-stock', 'inspection-completion'), async ({ page }) => {
    const probe = await installFe06Api(page, 'EMPLOYEE', { mediaCount: 1 });

    await page.goto(`/backoffice/inventory/inspections/${INSPECTION_ID}?source=intake`, {
      waitUntil: 'domcontentloaded',
    });
    await expect(
      page.getByRole('heading', { level: 1, name: 'Phiếu kiểm định iPhone' }),
    ).toBeVisible();
    await expect(page.getByRole('heading', { name: '18 hạng mục kỹ thuật' })).toBeVisible();
    const summaryControlHeights = await Promise.all(
      [
        '#battery-health-percent',
        '#battery-cycle-count',
        '#battery-replacement-status',
        '#condition-grade',
      ].map((selector) =>
        page.locator(selector).evaluate((element) => element.getBoundingClientRect().height),
      ),
    );
    expect(
      Math.max(...summaryControlHeights) - Math.min(...summaryControlHeights),
    ).toBeLessThanOrEqual(1);
    const noteHeights = await Promise.all(
      ['#cosmetic-notes', '#repair-notes'].map((selector) =>
        page.locator(selector).evaluate((element) => element.getBoundingClientRect().height),
      ),
    );
    expect(Math.max(...noteHeights) - Math.min(...noteHeights)).toBeLessThanOrEqual(1);
    const resultFields = await page.getByRole('combobox', { name: /^Kết quả của / }).all();
    expect(resultFields).toHaveLength(18);
    const resultControlHeights = await Promise.all(
      resultFields.map((field) =>
        field.evaluate((element) => element.getBoundingClientRect().height),
      ),
    );
    expect(
      Math.max(...resultControlHeights) - Math.min(...resultControlHeights),
    ).toBeLessThanOrEqual(1);
    expect(
      Math.abs((resultControlHeights[0] ?? 0) - (summaryControlHeights[0] ?? 0)),
      `Chiều cao tổng quan ${JSON.stringify(summaryControlHeights)}, checklist ${JSON.stringify(resultControlHeights)}`,
    ).toBeLessThanOrEqual(1);
    for (const field of resultFields) await field.selectOption('PASS');
    await page.getByLabel('Tình trạng pin (%)').fill('94');
    await page.getByLabel('Xếp loại ngoại hình').selectOption('A');

    await page.getByRole('button', { name: 'Lưu bản nháp', exact: true }).click();
    await expect(page.getByText('Đã lưu bản nháp kiểm định.', { exact: true })).toBeVisible();
    expect(probe.inspectionPatchBodies).toHaveLength(1);
    expect(checkItemCount(probe.inspectionPatchBodies[0])).toBe(18);

    const completeButton = page.getByRole('button', {
      name: 'Hoàn tất kiểm định',
      exact: true,
    });
    await completeButton.click();
    await expect(
      page.getByRole('heading', { level: 2, name: 'Xem lại tổng quan kiểm định' }),
    ).toBeVisible();
    await expect(page.getByText('Bạn sẽ chuyển sang bước Đưa máy lên bán.')).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.getByRole('button', { name: 'Quay lại chỉnh sửa', exact: true }).click();
    await expect(completeButton).toBeFocused();
    await completeButton.click();
    await expect(
      page.getByRole('heading', { level: 2, name: 'Xem lại tổng quan kiểm định' }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Xác nhận hoàn tất', exact: true }).click();

    await expect(page).toHaveURL(
      `/backoffice/inventory/intake?unitId=${UNIT_ID}&inspectionId=${INSPECTION_ID}`,
    );
    await expect(page.getByRole('heading', { level: 2, name: 'Đưa máy lên bán' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'Tiếp nhận máy' })).toHaveCount(0);
    expect(probe.inspectionCompleteRequests).toBe(1);
    expect(probe.inspectionPatchBodies).toHaveLength(2);
    expect(probe.inspectionStatus).toBe('COMPLETED');
  });

  test(bt('browser:inventory-stock', 'intake-resume-upload'), async ({ page }) => {
    const probe = await installFe06Api(page, 'EMPLOYEE', {
      mediaCount: 0,
      resumeDelayMs: 400,
    });

    await page.goto(
      `/backoffice/inventory/intake?unitId=${UNIT_ID}&inspectionId=${INSPECTION_ID}`,
      { waitUntil: 'domcontentloaded' },
    );
    await expect(page.getByRole('heading', { level: 2, name: 'Tiếp nhận máy' })).toHaveCount(0);
    await expect(page.getByLabel('Sản phẩm iPhone')).toHaveCount(0);
    await expect(page.getByText('Đang mở lại tiến độ nhập máy…')).toBeAttached();
    await expect(
      page.getByRole('heading', { level: 2, name: 'Ảnh thực tế của máy' }),
    ).toBeVisible();

    const fileInput = page.locator('#inventory-media-file');
    await expect(fileInput).toHaveCSS('width', '1px');
    await expect(fileInput).toHaveCSS('height', '1px');
    await page.emulateMedia({ forcedColors: 'active' });
    await fileInput.focus();
    const filePicker = page.locator('label[for="inventory-media-file"]');
    await expect(filePicker).toHaveCSS('outline-style', 'solid');
    await expect(filePicker).toHaveCSS('outline-width', '3px');
    await page.emulateMedia({ forcedColors: 'none' });
    const uploadButton = page.getByRole('button', { name: 'Tải ảnh lên', exact: true });
    await expect(uploadButton).toBeDisabled();
    await fileInput.setInputFiles({
      buffer: Buffer.alloc(0),
      mimeType: 'image/png',
      name: 'rong.png',
    });
    await expect(page.locator('main [role="alert"]')).toContainText('Tệp ảnh đang trống');
    await expect(uploadButton).toBeDisabled();
    await fileInput.setInputFiles({
      buffer: Buffer.from('khong-phai-anh'),
      mimeType: 'text/plain',
      name: 'khong-hop-le.txt',
    });
    await expect(page.locator('main [role="alert"]')).toContainText('JPEG, PNG hoặc WebP');
    await expect(uploadButton).toBeDisabled();
    await fileInput.setInputFiles({
      buffer: Buffer.alloc(8 * 1024 * 1024 + 1),
      mimeType: 'image/png',
      name: 'qua-lon.png',
    });
    await expect(page.locator('main [role="alert"]')).toContainText('8 MB');
    await expect(uploadButton).toBeDisabled();
    await fileInput.setInputFiles('docs/assets/ui/fe-06/intake-1440.png');
    await expect(page.getByText('intake-1440.png', { exact: true })).toBeVisible();
    await expect(uploadButton).toBeEnabled();
    await uploadButton.click();

    await expect(page.getByText('Đã tải ảnh thực tế của máy lên thành công.')).toBeVisible();
    await expect(
      page.getByRole('heading', { level: 2, name: 'Kiểm định 18 hạng mục' }),
    ).toBeVisible();
    expect(probe.mediaCount).toBe(1);
    await expectSingleMainAndNoOverflow(page);
  });

  test(bt('browser:inventory-stock', 'mobile-step-four'), async ({ page }) => {
    const probe = await installFe06Api(page, 'EMPLOYEE', { mediaCount: 1 });
    probe.inspectionStatus = 'COMPLETED';
    probe.inspectionValues = passingInspectionValues();
    await page.setViewportSize({ width: 360, height: 800 });

    await page.goto(
      `/backoffice/inventory/intake?unitId=${UNIT_ID}&inspectionId=${INSPECTION_ID}`,
      { waitUntil: 'domcontentloaded' },
    );
    await expect(page.getByRole('heading', { level: 2, name: 'Đưa máy lên bán' })).toBeVisible();

    const progress = page.getByLabel('Tiến độ nhập máy');
    const currentStep = progress.locator('[aria-current="step"]');
    await expect(currentStep).toHaveCount(1);
    await expect(currentStep).toContainText('Sẵn sàng bán');
    await expect
      .poll(() =>
        currentStep.evaluate((element) => {
          const item = element.getBoundingClientRect();
          const scroller = element.closest('ol')?.getBoundingClientRect();
          return (
            scroller !== undefined && item.left >= scroller.left && item.right <= scroller.right
          );
        }),
      )
      .toBe(true);
    await expectSingleMainAndNoOverflow(page);
  });

  test(bt('browser:inventory-stock', 'inspection-source-integrity'), async ({ page }) => {
    const probe = await installFe06Api(page, 'EMPLOYEE', { inspectionType: 'WARRANTY' });
    probe.inspectionValues = passingInspectionValues();

    await page.goto(`/backoffice/inventory/inspections/${INSPECTION_ID}?source=intake`, {
      waitUntil: 'domcontentloaded',
    });
    await expect(
      page.getByRole('heading', { level: 1, name: 'Phiếu kiểm định iPhone' }),
    ).toBeVisible();
    await expect(page.getByLabel('Tiến độ nhập máy')).toHaveCount(0);

    await page.getByRole('button', { name: 'Hoàn tất kiểm định', exact: true }).click();
    await expect(
      page.getByRole('heading', { level: 2, name: 'Xem lại tổng quan kiểm định' }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Xác nhận hoàn tất', exact: true }).click();

    await expect(page).toHaveURL(
      `/backoffice/inventory/inspections/${INSPECTION_ID}?source=intake`,
    );
    await expect(page.getByRole('heading', { level: 2, name: 'Tổng hợp kiểm định' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Quay lại quy trình nhập máy' })).toHaveCount(0);
    expect(probe.inspectionCompleteRequests).toBe(1);
  });

  test(bt('browser:inventory-stock', 'stock-ledger'), async ({ page }) => {
    const probe = await installFe06Api(page, 'EMPLOYEE');

    await page.goto('/backoffice/inventory/stock', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { level: 1, name: 'Tồn phụ kiện' })).toBeVisible();
    await expect(page.getByRole('row', { name: new RegExp(ACCESSORY_NAME) })).toBeVisible();
    const levelsBefore = probe.stockLevelRequests;
    const movementsBefore = probe.stockMovementRequests;

    const receiveButton = page.getByRole('button', { name: 'Nhận hàng', exact: true });
    await expect(receiveButton).toHaveCSS('color', 'rgb(255, 255, 255)');
    await receiveButton.click();
    const dialog = page.getByRole('dialog', { name: 'Nhận hàng' });
    await expect(dialog).toBeVisible();
    await expectAccessible(page);
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(receiveButton).toBeFocused();

    await receiveButton.click();
    await expect(dialog).toBeVisible();
    await dialog.getByLabel('Phụ kiện').selectOption(ACCESSORY_VARIANT_ID);
    await dialog.getByLabel('Nhận tại').selectOption(STORE_ID);
    await dialog.getByLabel('Số lượng').fill('3');
    await dialog.getByRole('button', { name: 'Xác nhận nhận hàng', exact: true }).click();

    await expect(page.getByText('Nhận hàng đã được ghi vào lịch sử kho.')).toBeVisible();
    expect(probe.stockCommandBodies).toEqual([
      {
        body: { locationId: STORE_ID, quantity: 3, variantId: ACCESSORY_VARIANT_ID },
        path: '/api/v1/backoffice/stock/receive',
      },
    ]);
    await expect.poll(() => probe.stockLevelRequests).toBeGreaterThan(levelsBefore);
    await expect.poll(() => probe.stockMovementRequests).toBeGreaterThan(movementsBefore);
    expect(probe.stockQuantity).toBe(13);
    await expect(page.getByText('13', { exact: true }).first()).toBeVisible();

    await page.goto('/backoffice/inventory/stock/movements', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { level: 1, name: 'Lịch sử kho' })).toBeVisible();
    await expect(page.getByText('Lịch sử chỉ được ghi thêm')).toBeVisible();
    await expect(page.getByText('Nhận hàng kiểm thử FE06')).toBeVisible();
    await expect(page.getByText('Nhân viên kho FE06').first()).toBeVisible();
    await expectSingleMainAndNoOverflow(page);
  });

  test(bt('browser:inventory-stock', 'inventory-responsive'), async ({ page }) => {
    test.slow();
    const browserErrors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') browserErrors.push(message.text());
    });
    page.on('pageerror', (error) => {
      browserErrors.push(error.message);
    });
    await installFe06Api(page, 'ADMIN');
    const screens = [
      {
        heading: 'Tổng quan vận hành',
        path: '/backoffice',
        ready: 'Tình hình vận hành',
        slug: 'overview',
      },
      {
        heading: 'Danh sách máy',
        path: '/backoffice/inventory/units',
        ready: PRODUCT_NAME,
        slug: 'units',
      },
      { heading: 'Nhập máy vào kho', path: '/backoffice/inventory/intake', slug: 'intake' },
      { heading: 'Tra cứu mã máy', path: '/backoffice/inventory/lookup', slug: 'lookup' },
      {
        heading: PRODUCT_NAME,
        path: `/backoffice/inventory/units/${UNIT_ID}`,
        ready: 'Giá vốn nội bộ',
        slug: 'unit-detail',
      },
      {
        heading: 'Phiếu kiểm định iPhone',
        path: `/backoffice/inventory/inspections/${INSPECTION_ID}`,
        ready: '18 hạng mục kỹ thuật',
        slug: 'inspection',
      },
      {
        heading: 'Địa điểm vận hành',
        path: '/backoffice/inventory/locations',
        ready: 'Kho trung tâm',
        slug: 'locations',
      },
      {
        heading: 'Tồn phụ kiện',
        path: '/backoffice/inventory/stock',
        ready: ACCESSORY_NAME,
        slug: 'stock',
      },
      {
        heading: 'Lịch sử kho',
        path: '/backoffice/inventory/stock/movements',
        ready: 'Kiểm đếm đầu ngày',
        slug: 'movements',
      },
    ] as const;
    const mobileCaptures = new Set(['overview', 'units', 'unit-detail', 'inspection', 'stock']);

    for (const viewport of [
      { width: 1440, height: 900 },
      { width: 390, height: 844 },
    ]) {
      await page.setViewportSize(viewport);
      for (const screen of screens) {
        await page.goto(screen.path, { waitUntil: 'domcontentloaded' });
        await expect(page.getByRole('heading', { level: 1, name: screen.heading })).toBeVisible();
        if (screen.path === '/backoffice/inventory/intake') {
          await expect(page.getByLabel('Biến thể đang bán')).toHaveValue(VARIANT_ID);
        }
        if ('ready' in screen) {
          const readyContent =
            screen.slug === 'stock'
              ? page.getByRole('row', { name: new RegExp(ACCESSORY_NAME) })
              : page.locator('main').getByText(screen.ready).last();
          await expect(readyContent).toBeVisible();
        }
        if (screen.slug === 'stock') {
          const receiveButton = page.getByRole('button', { name: 'Nhận hàng', exact: true });
          await expect(receiveButton).toBeEnabled();
          await expect(receiveButton).toHaveCSS('color', 'rgb(255, 255, 255)');
          await expect(receiveButton).toHaveCSS('opacity', '1');
        }
        await expectNaturalVietnameseMain(page);
        await expectSingleMainAndNoOverflow(page);
        await expectAccessible(page);
        if (viewport.width === 390) {
          const currentNavigationItem = page
            .getByRole('navigation', { name: 'Các khu vực vận hành' })
            .locator('a[aria-current="page"]');
          await expect
            .poll(() =>
              currentNavigationItem.evaluate((element) => {
                const item = element.getBoundingClientRect();
                const navigation = element.closest('nav')?.getBoundingClientRect();
                return (
                  navigation !== undefined &&
                  item.left >= navigation.left &&
                  item.right <= navigation.right
                );
              }),
            )
            .toBe(true);
        }
        if (
          process.env['FE09_CAPTURE_SCREENSHOTS'] === '1' &&
          (viewport.width === 1440 || mobileCaptures.has(screen.slug))
        ) {
          await captureAuditScreenshot(page, `${screen.slug}-${String(viewport.width)}`);
        }
      }
    }

    for (const viewport of [
      { name: 'mobile-320', width: 320, height: 844 },
      { name: 'mobile-390', width: 390, height: 844 },
      { name: 'tablet-768', width: 768, height: 1024 },
      { name: 'desktop-1024', width: 1024, height: 768 },
      { name: 'desktop-1440', width: 1440, height: 900 },
    ] as const) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto(
        `/backoffice/inventory/intake?unitId=${UNIT_ID}&inspectionId=${INSPECTION_ID}`,
        { waitUntil: 'domcontentloaded' },
      );
      await expect(
        page.getByRole('heading', { level: 2, name: 'Ảnh thực tế của máy' }),
      ).toBeVisible();
      const fileInput = page.locator('#inventory-media-file');
      await fileInput.setInputFiles('docs/assets/ui/fe-06/intake-1440.png');
      const uploadButton = page.getByRole('button', { name: 'Tải ảnh lên', exact: true });
      await expect(uploadButton).toBeEnabled();
      await expectSingleMainAndNoOverflow(page);
      await expectStickyTopbarAndReachableAction(page, uploadButton);

      if (viewport.name === 'desktop-1440' || viewport.name === 'mobile-390') {
        await prepareWp11Visual(page);
        await expect(page).toHaveScreenshot(`wp11-inventory-intake-resume-${viewport.name}.png`, {
          animations: 'disabled',
          caret: 'hide',
          fullPage: true,
        });
      }
    }
    expect(browserErrors).toEqual([]);
  });
});

async function installFe06Api(
  page: Page,
  role: StaffRole,
  options: Fe06ApiOptions = {},
): Promise<Fe06Probe> {
  const resumeDelayMs = Math.max(0, options.resumeDelayMs ?? 0);
  const probe: Fe06Probe = {
    costRequests: 0,
    inspectionCompleteRequests: 0,
    inspectionPatchBodies: [],
    inspectionStatus: 'DRAFT',
    inspectionType: options.inspectionType ?? 'INTAKE',
    inspectionValues: {},
    lookupBody: null,
    lookupRequests: [],
    mediaCount: Math.max(0, options.mediaCount ?? 0),
    movements: [
      {
        createdAt: '2026-08-28T06:30:00.000Z',
        id: '0199d006-0000-7000-8000-000000000011',
        quantity: 10,
        reason: 'Kiểm đếm đầu ngày',
        type: 'ADJUSTMENT_IN',
      },
    ],
    stockCommandBodies: [],
    stockLevelRequests: 0,
    stockMovementRequests: 0,
    stockQuantity: 10,
    unitListQueries: [],
  };

  await page.route('**/api/v1/auth/refresh', async (route) => {
    await fulfillJson(route, {
      data: { accessToken: `fe06-${role.toLowerCase()}-access`, user: staffUser(role) },
    });
  });

  await page.route('**/api/v1/backoffice/**', async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await fulfillPreflight(route);
      return;
    }
    const url = new URL(route.request().url());
    const { pathname } = url;
    const method = route.request().method();

    if (pathname.endsWith('/backoffice/products') && method === 'GET') {
      await fulfillJson(route, paged([catalogProductListItem()], 100));
      return;
    }
    if (pathname.endsWith(`/backoffice/products/${PRODUCT_ID}`) && method === 'GET') {
      await fulfillJson(route, { data: catalogProductDetail() });
      return;
    }
    if (pathname.endsWith('/backoffice/inventory-locations') && method === 'GET') {
      await fulfillJson(route, { data: inventoryLocations() });
      return;
    }
    if (pathname.endsWith('/backoffice/overview') && method === 'GET') {
      await fulfillJson(route, { data: overviewSnapshot() });
      return;
    }
    if (pathname.endsWith('/backoffice/inventory-units/lookup-identifier') && method === 'POST') {
      probe.lookupBody = requestJson(route);
      probe.lookupRequests.push({ method, url: route.request().url() });
      if (options.lookupOutcome === 'not-found') {
        await fulfillJson(
          route,
          {
            error: {
              code: 'RESOURCE_NOT_FOUND',
              details: [],
              message: 'Không tìm thấy máy.',
              requestId: 'fe09-lookup-not-found',
            },
          },
          404,
        );
        return;
      }
      if (options.lookupOutcome === 'provider-error') {
        await fulfillJson(
          route,
          {
            error: {
              code: 'SERVICE_UNAVAILABLE',
              details: [],
              message: 'Chưa thể kết nối dịch vụ.',
              requestId: 'fe09-lookup-provider',
            },
          },
          503,
        );
        return;
      }
      await fulfillJson(route, { data: inventoryUnit(probe) });
      return;
    }
    if (pathname.endsWith(`/backoffice/inventory-units/${UNIT_ID}/cost`) && method === 'GET') {
      probe.costRequests += 1;
      await fulfillJson(route, {
        data: { acquisitionCost: '9000000', additionalCost: '200000', totalCost: '9200000' },
      });
      return;
    }
    if (
      pathname.endsWith(`/backoffice/inventory-units/${UNIT_ID}/inspections`) &&
      method === 'GET'
    ) {
      await delay(resumeDelayMs);
      await fulfillJson(route, paged([inspectionSummary(probe)], 50));
      return;
    }
    if (pathname.endsWith(`/backoffice/inventory-units/${UNIT_ID}/media`) && method === 'POST') {
      probe.mediaCount += 1;
      await fulfillJson(route, { data: inventoryMedia(probe.mediaCount - 1) }, 201);
      return;
    }
    if (pathname.endsWith(`/backoffice/inventory-units/${UNIT_ID}`) && method === 'GET') {
      await delay(resumeDelayMs);
      await fulfillJson(route, { data: inventoryUnit(probe) });
      return;
    }
    if (pathname.endsWith('/backoffice/inventory-units') && method === 'GET') {
      probe.unitListQueries.push(url.searchParams.toString());
      await fulfillJson(
        route,
        paged([inventoryUnit(probe)], Number(url.searchParams.get('pageSize')) || 20),
      );
      return;
    }
    if (
      pathname.endsWith(`/backoffice/inspections/${INSPECTION_ID}/complete`) &&
      method === 'POST'
    ) {
      probe.inspectionCompleteRequests += 1;
      probe.inspectionStatus = 'COMPLETED';
      await fulfillJson(route, { data: inspectionDetail(probe) });
      return;
    }
    if (pathname.endsWith(`/backoffice/inspections/${INSPECTION_ID}`) && method === 'PATCH') {
      const body = requestJson(route);
      probe.inspectionPatchBodies.push(body);
      probe.inspectionValues = { ...probe.inspectionValues, ...body };
      await fulfillJson(route, { data: inspectionDetail(probe) });
      return;
    }
    if (pathname.endsWith(`/backoffice/inspections/${INSPECTION_ID}`) && method === 'GET') {
      await delay(resumeDelayMs);
      await fulfillJson(route, { data: inspectionDetail(probe) });
      return;
    }
    if (pathname.endsWith('/backoffice/stock-levels') && method === 'GET') {
      probe.stockLevelRequests += 1;
      await fulfillJson(
        route,
        paged([stockLevel(probe.stockQuantity)], Number(url.searchParams.get('pageSize')) || 20),
      );
      return;
    }
    if (pathname.endsWith('/backoffice/stock-movements') && method === 'GET') {
      probe.stockMovementRequests += 1;
      const pageSize = Number(url.searchParams.get('pageSize')) || 20;
      await fulfillJson(
        route,
        paged(
          probe.movements.slice(0, pageSize).map(stockMovement),
          pageSize,
          probe.movements.length,
        ),
      );
      return;
    }
    if (pathname.endsWith('/backoffice/stock/receive') && method === 'POST') {
      const body = requestJson(route);
      probe.stockCommandBodies.push({ body, path: pathname });
      const quantity = numberField(body, 'quantity') ?? 0;
      probe.stockQuantity += quantity;
      const movement: MovementFixture = {
        createdAt: '2026-08-28T08:00:00.000Z',
        id: '0199d006-0000-7000-8000-000000000012',
        quantity,
        reason: 'Nhận hàng kiểm thử FE06',
        type: 'RECEIPT',
      };
      probe.movements.unshift(movement);
      await fulfillJson(route, {
        data: {
          affectedLevels: [stockLevel(probe.stockQuantity)],
          movement: stockMovement(movement),
        },
      });
      return;
    }

    await fulfillJson(
      route,
      { error: { code: 'RESOURCE_NOT_FOUND', message: 'Không có dữ liệu giả lập phù hợp.' } },
      404,
    );
  });

  return probe;
}

function staffUser(role: StaffRole) {
  return {
    email: `${role.toLowerCase()}-fe06@rephone.local`,
    fullName: role === 'ADMIN' ? 'Quản trị viên kho FE06' : 'Nhân viên kho FE06',
    id: STAFF_ID,
    phone: '0900000606',
    role,
    status: 'ACTIVE',
  } as const;
}

function inventoryLocations() {
  return [
    { code: 'HCM-01', id: STORE_ID, name: 'Cửa hàng Quận 1', status: 'ACTIVE', type: 'STORE' },
    {
      code: 'KHO-HCM',
      id: WAREHOUSE_ID,
      name: 'Kho trung tâm Thành phố Hồ Chí Minh',
      status: 'ACTIVE',
      type: 'WAREHOUSE',
    },
  ] as const;
}

function inventoryUnit(probe: Fe06Probe) {
  const completed = probe.inspectionStatus === 'COMPLETED';
  return {
    activeReservationCount: 0,
    availabilityReadiness: { isReady: false, reasons: ['INSPECTION_REQUIRED'] },
    availableActions: [
      'CREATE_INSPECTION',
      'SEND_TO_REPAIR',
      'QUARANTINE',
      'WRITE_OFF',
      'TRANSFER',
      'UPLOAD_MEDIA',
    ],
    carrierName: null,
    compareAtPrice: '13900000',
    currentInspection: {
      batteryHealthPercent: completed
        ? numberField(probe.inspectionValues, 'batteryHealthPercent')
        : null,
      conditionGrade: completed ? stringField(probe.inspectionValues, 'conditionGrade') : null,
      id: INSPECTION_ID,
      inspectedAt: completed ? '2026-08-28T08:10:00.000Z' : null,
      overallResult: completed ? 'PASSED' : 'INCOMPLETE',
    },
    id: UNIT_ID,
    inventoryCode: 'RPH-FE06-0001',
    lifecycleStatus: 'INSPECTING',
    location: inventoryLocations()[0],
    maskedIdentifiers: [{ maskedValue: '***********7518', type: 'IMEI_1' }],
    media: Array.from({ length: probe.mediaCount }, (_, index) => inventoryMedia(index)),
    mediaCount: probe.mediaCount,
    modelNumber: 'A2848',
    product: { id: PRODUCT_ID, name: PRODUCT_NAME, slug: 'iphone-15-pro', status: 'ACTIVE' },
    receivedAt: '2026-08-28T06:00:00.000Z',
    regionCode: 'VN/A',
    salePrice: '12500000',
    simConfiguration: 'PHYSICAL_AND_ESIM',
    simLockStatus: 'UNLOCKED',
    updatedAt: '2026-08-28T07:00:00.000Z',
    variant: {
      displayName: '128 GB · Titan tự nhiên',
      id: VARIANT_ID,
      sku: 'IP15P-128-NT',
      status: 'ACTIVE',
    },
    warrantyDaysOverride: 90,
  } as const;
}

function inventoryMedia(index: number) {
  return {
    altText: `Ảnh thực tế kiểm thử FE06 ${String(index + 1)}`,
    createdAt: '2026-08-28T07:05:00.000Z',
    fileSize: 71_752,
    height: 760,
    id: `0199d006-0000-7000-8000-${String(index + 20).padStart(12, '0')}`,
    mimeType: 'image/png',
    sortOrder: index,
    url: '/fe06-inventory-media.png',
    width: 2_560,
  } as const;
}

function inspectionSummary(probe: Fe06Probe) {
  return {
    createdAt: '2026-08-28T06:15:00.000Z',
    id: INSPECTION_ID,
    inspectedAt: probe.inspectionStatus === 'COMPLETED' ? '2026-08-28T08:10:00.000Z' : null,
    inspectionType: probe.inspectionType,
    inspector: { employeeCode: 'NV-FE06', fullName: 'Nhân viên kho FE06', id: STAFF_ID },
    inspectorId: STAFF_ID,
    isCurrent: probe.inspectionStatus === 'COMPLETED',
    overallResult: probe.inspectionStatus === 'COMPLETED' ? 'PASSED' : 'INCOMPLETE',
    status: probe.inspectionStatus,
    updatedAt: '2026-08-28T07:00:00.000Z',
  } as const;
}

function inspectionDetail(probe: Fe06Probe) {
  const values = probe.inspectionValues;
  const checks = recordField(values, 'checks');
  const statusByKey = recordField(checks ?? {}, 'items');
  return {
    ...inspectionSummary(probe),
    batteryCycleCount: numberField(values, 'batteryCycleCount'),
    batteryHealthPercent: numberField(values, 'batteryHealthPercent'),
    batteryReplacementStatus: stringField(values, 'batteryReplacementStatus') ?? 'UNKNOWN',
    checks,
    checklist: {
      items: CHECKS.map(([key, label], order) => {
        const item = recordField(statusByKey ?? {}, key);
        return {
          key,
          label,
          note: stringField(item ?? {}, 'note'),
          order: order + 1,
          status: stringField(item ?? {}, 'status'),
        };
      }),
      schemaVersion: 1,
    },
    conditionGrade: stringField(values, 'conditionGrade'),
    cosmeticNotes: stringField(values, 'cosmeticNotes'),
    inventoryUnitId: UNIT_ID,
    repairHistoryStatus: stringField(values, 'repairHistoryStatus') ?? 'UNKNOWN',
    repairNotes: stringField(values, 'repairNotes'),
    replacedParts: null,
  };
}

function catalogProductListItem() {
  return {
    brand: 'Apple',
    createdAt: '2026-08-28T05:00:00.000Z',
    id: PRODUCT_ID,
    name: PRODUCT_NAME,
    primaryMedia: null,
    releaseYear: 2023,
    slug: 'iphone-15-pro',
    status: 'ACTIVE',
    type: 'IPHONE',
    updatedAt: '2026-08-28T05:00:00.000Z',
    variantCount: 1,
  } as const;
}

function catalogProductDetail() {
  return {
    ...catalogProductListItem(),
    archivedAt: null,
    chipset: 'Apple A17 Pro',
    description: 'Máy dùng cho hợp đồng trình duyệt FE06.',
    media: [],
    ramGb: 8,
    screenSizeInches: '6.1',
    seoDescription: null,
    seoTitle: null,
    variants: [
      {
        accessoryAttributes: null,
        colorHex: '#b9b3aa',
        colorName: 'Titan tự nhiên',
        compareAtPrice: null,
        createdAt: '2026-08-28T05:00:00.000Z',
        displayName: '128 GB · Titan tự nhiên',
        id: VARIANT_ID,
        inventoryMode: 'SERIALIZED',
        media: [],
        productId: PRODUCT_ID,
        salePrice: null,
        sku: 'IP15P-128-NT',
        status: 'ACTIVE',
        storageCapacityGb: 128,
        updatedAt: '2026-08-28T05:00:00.000Z',
        warrantyPolicyId: null,
      },
    ],
    warrantyPolicyId: null,
  } as const;
}

function accessoryProduct() {
  return {
    id: ACCESSORY_PRODUCT_ID,
    name: ACCESSORY_NAME,
    slug: 'cu-sac-usb-c-20w',
    status: 'ACTIVE',
  } as const;
}

function accessoryVariant() {
  return {
    displayName: 'Màu trắng',
    id: ACCESSORY_VARIANT_ID,
    sku: 'SAC-20W-WHT',
    status: 'ACTIVE',
  } as const;
}

function stockLevel(quantity: number) {
  return {
    id: STOCK_LEVEL_ID,
    location: inventoryLocations()[0],
    lowStock: quantity <= 3,
    product: accessoryProduct(),
    quantityAvailable: quantity,
    quantityOnHand: quantity,
    quantityReserved: 0,
    reorderThreshold: 3,
    updatedAt: '2026-08-28T08:00:00.000Z',
    variant: accessoryVariant(),
  };
}

function stockMovement(movement: MovementFixture) {
  return {
    createdAt: movement.createdAt,
    createdBy: { employeeCode: 'NV-FE06', fullName: 'Nhân viên kho FE06', id: STAFF_ID },
    createdById: STAFF_ID,
    fromLocation: null,
    fromLocationId: null,
    id: movement.id,
    product: accessoryProduct(),
    quantity: movement.quantity,
    reason: movement.reason,
    referenceId: null,
    referenceType: null,
    toLocation: inventoryLocations()[0],
    toLocationId: STORE_ID,
    type: movement.type,
    variant: accessoryVariant(),
    variantId: ACCESSORY_VARIANT_ID,
  };
}

function overviewSnapshot() {
  return {
    generatedAt: '2026-09-02T03:00:00.000Z',
    metrics: {
      activeOrders: 4,
      lowStockLevels: 1,
      openAfterSales: 2,
      paymentsUnderReview: 1,
    },
    priorities: [
      {
        count: 1,
        href: '/backoffice/payments?status=UNDER_REVIEW',
        key: 'PAYMENT_REVIEW_OVERDUE',
        oldestAt: '2026-09-01T03:00:00.000Z',
      },
    ],
    recentOrders: [],
  } as const;
}

function paged(data: readonly unknown[], pageSize: number, totalItems: number = data.length) {
  return {
    data,
    meta: {
      pagination: {
        page: 1,
        pageSize,
        totalItems,
        totalPages: totalItems === 0 ? 0 : Math.ceil(totalItems / pageSize),
      },
    },
  };
}

function requestJson(route: Route): Record<string, unknown> {
  const value: unknown = route.request().postDataJSON();
  return isRecord(value) ? value : {};
}

function recordField(value: Record<string, unknown>, key: string): Record<string, unknown> | null {
  const field = value[key];
  return isRecord(field) ? field : null;
}

function stringField(value: Record<string, unknown>, key: string): string | null {
  return typeof value[key] === 'string' ? value[key] : null;
}

function numberField(value: Record<string, unknown>, key: string): number | null {
  return typeof value[key] === 'number' ? value[key] : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function checkItemCount(body: Record<string, unknown> | undefined): number {
  const checks = body === undefined ? null : recordField(body, 'checks');
  const items = checks === null ? null : recordField(checks, 'items');
  return items === null ? 0 : Object.keys(items).length;
}

function passingInspectionValues(): Record<string, unknown> {
  return {
    batteryHealthPercent: 94,
    batteryReplacementStatus: 'ORIGINAL',
    checks: {
      items: Object.fromEntries(CHECKS.map(([key]) => [key, { note: null, status: 'PASS' }])),
      schemaVersion: 1,
    },
    conditionGrade: 'A',
    cosmeticNotes: null,
    repairHistoryStatus: 'NONE_KNOWN',
    repairNotes: null,
  };
}

async function delay(milliseconds: number): Promise<void> {
  if (milliseconds <= 0) return;
  await new Promise<void>((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

async function fulfillPreflight(route: Route): Promise<void> {
  await route.fulfill({ status: 204, headers: corsHeaders(route) });
}

async function fulfillJson(route: Route, body: unknown, status = 200): Promise<void> {
  await route.fulfill({
    body: JSON.stringify(body),
    contentType: 'application/json',
    headers: corsHeaders(route),
    status,
  });
}

function corsHeaders(route: Route): Record<string, string> {
  const origin = route.request().headers()['origin'];
  return {
    ...(origin === undefined
      ? {}
      : {
          'Access-Control-Allow-Credentials': 'true',
          'Access-Control-Allow-Origin': origin,
        }),
    'Access-Control-Allow-Headers': 'authorization, content-type, x-csrf-token',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  };
}

async function expectNaturalVietnameseMain(page: Page): Promise<void> {
  const mainText = await page.locator('main').innerText();
  expect(mainText).not.toMatch(
    /\b(?:DRAFT|ACTIVE|INCOMPLETE|scopeConfig|localStorage|URL)\b|access token|refresh session|trình duyệt|[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|\b\d{15}\b|\b\d{32}\b/i,
  );
}

async function expectSingleMainAndNoOverflow(page: Page): Promise<void> {
  await expect(page.locator('main')).toHaveCount(1);
  const dimensions = await page.evaluate(() => {
    const clientWidth = document.documentElement.clientWidth;
    const shell = document.querySelector('[class*="backofficeShell"]');
    const shellRect = shell?.getBoundingClientRect();
    return {
      clientWidth,
      overflowingElements: Array.from(document.querySelectorAll('body *'))
        .map((element) => {
          const rect = element.getBoundingClientRect();
          return {
            className: element.className,
            right: Math.round(rect.right),
            tagName: element.tagName,
          };
        })
        .filter((element) => element.right > clientWidth + 1)
        .slice(0, 8),
      shell:
        shell === null
          ? null
          : {
              overflowX: getComputedStyle(shell).overflowX,
              rect:
                shellRect === undefined
                  ? null
                  : {
                      left: shellRect.left,
                      right: shellRect.right,
                      width: shellRect.width,
                    },
              scrollWidth: shell.scrollWidth,
            },
      scrollWidth: document.documentElement.scrollWidth,
    };
  });
  expect(
    dimensions.scrollWidth,
    `Shell: ${JSON.stringify(dimensions.shell)}; phần tử tràn: ${JSON.stringify(dimensions.overflowingElements)}`,
  ).toBeLessThanOrEqual(dimensions.clientWidth);
}

async function expectAccessible(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page })
    .exclude('nextjs-portal')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(
    results.violations
      .filter(({ impact }) => impact === 'serious' || impact === 'critical')
      .map(({ id, impact, nodes }) => ({
        id,
        impact,
        nodes: nodes.map(({ target, html, failureSummary }) => ({
          target,
          html,
          failureSummary,
        })),
      })),
  ).toEqual([]);
}

async function expectStickyTopbarAndReachableAction(
  page: Page,
  action: ReturnType<Page['getByRole']>,
): Promise<void> {
  await action.scrollIntoViewIfNeeded();
  await expect(action).toBeInViewport();
  const geometry = await action.evaluate((element) => {
    const actionRect = element.getBoundingClientRect();
    const topbar = document.querySelector<HTMLElement>('[data-shell="backoffice"] > header');
    const topbarRect = topbar?.getBoundingClientRect();
    const centerX = Math.min(
      window.innerWidth - 1,
      Math.max(0, actionRect.left + actionRect.width / 2),
    );
    const centerY = Math.min(
      window.innerHeight - 1,
      Math.max(0, actionRect.top + actionRect.height / 2),
    );
    const hit = document.elementFromPoint(centerX, centerY);
    return {
      actionBottom: actionRect.bottom,
      actionTop: actionRect.top,
      hit: hit === element || (hit !== null && element.contains(hit)),
      topbarBottom: topbarRect?.bottom ?? 0,
      topbarPosition: topbar === null ? null : getComputedStyle(topbar).position,
      topbarTop: topbarRect?.top ?? null,
      viewportHeight: window.innerHeight,
    };
  });
  expect(geometry.topbarPosition).toBe('sticky');
  expect(geometry.topbarTop).not.toBeNull();
  expect(Math.abs(geometry.topbarTop ?? 0)).toBeLessThanOrEqual(1);
  expect(geometry.actionTop).toBeGreaterThanOrEqual(geometry.topbarBottom - 1);
  expect(geometry.actionBottom).toBeLessThanOrEqual(geometry.viewportHeight + 1);
  expect(geometry.hit).toBe(true);
}

async function prepareWp11Visual(page: Page): Promise<void> {
  await stabilizeVisualPage(page);
  await page.evaluate(async () => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    window.scrollTo(0, 0);
    await document.fonts.ready;
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          resolve();
        });
      });
    });
  });
}

let auditScreenshotSequence = 0;

async function captureAuditScreenshot(page: Page, name: string): Promise<void> {
  auditScreenshotSequence += 1;
  const directory = path.resolve('.local/fe09/wp08-audit');
  await mkdir(directory, { recursive: true });
  const sequence = String(auditScreenshotSequence).padStart(2, '0');
  await page.locator('nextjs-portal').evaluateAll((portals) => {
    for (const portal of portals) {
      portal.setAttribute('aria-hidden', 'true');
      portal.setAttribute('hidden', '');
      (portal as HTMLElement).style.setProperty('display', 'none', 'important');
    }
  });
  await page.screenshot({
    animations: 'disabled',
    path: path.join(directory, `${sequence}-${name}.png`),
  });
}
