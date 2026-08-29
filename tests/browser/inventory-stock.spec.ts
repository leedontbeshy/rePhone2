import { expect, test, type Page, type Route } from '@playwright/test';

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
  inspectionValues: Record<string, unknown>;
  lookupBody: Record<string, unknown> | null;
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
  test('keeps the employee unit profile free of cost requests and cost UI', async ({ page }) => {
    const probe = await installFe06Api(page, 'EMPLOYEE');

    await page.goto(`/backoffice/inventory/units/${UNIT_ID}`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { level: 1, name: PRODUCT_NAME })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Mã định danh' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Giá vốn nội bộ' })).toHaveCount(0);
    await page.waitForTimeout(150);
    expect(probe.costRequests).toBe(0);
    await expectSingleMainAndNoOverflow(page);
  });

  test('looks up a raw identifier through an automatically audited POST body', async ({ page }) => {
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
  });

  test('filters the unit queue without reloading and blocks raw identifiers from URLs and GETs', async ({
    page,
  }) => {
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

  test('edits all 18 inspection items, saves a draft, then completes it', async ({ page }) => {
    const probe = await installFe06Api(page, 'EMPLOYEE');

    await page.goto(`/backoffice/inventory/inspections/${INSPECTION_ID}`, {
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
    ).toBeLessThanOrEqual(1);
    for (const field of resultFields) await field.selectOption('PASS');
    await page.getByLabel('Tình trạng pin (%)').fill('94');
    await page.getByLabel('Xếp loại ngoại hình').selectOption('A');

    await page.getByRole('button', { name: 'Lưu bản nháp', exact: true }).click();
    await expect(page.getByText('Đã lưu bản nháp kiểm định.', { exact: true })).toBeVisible();
    expect(probe.inspectionPatchBodies).toHaveLength(1);
    expect(checkItemCount(probe.inspectionPatchBodies[0])).toBe(18);

    await page.getByRole('button', { name: 'Hoàn tất kiểm định', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Hoàn tất phiếu kiểm định?' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Hoàn tất kiểm định', exact: true }).click();

    await expect(page.getByText('Đã hoàn tất phiếu kiểm định.', { exact: true })).toBeVisible();
    await expect(page.getByText('Phiếu đã hoàn tất và không thể chỉnh sửa.')).toBeVisible();
    expect(probe.inspectionCompleteRequests).toBe(1);
    expect(probe.inspectionPatchBodies).toHaveLength(2);
    expect(probe.inspectionStatus).toBe('COMPLETED');
  });

  test('records a stock command, reconciles levels and exposes the immutable ledger', async ({
    page,
  }) => {
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

  test('renders all eight inventory routes without document overflow at 1440px and 360px', async ({
    page,
  }) => {
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
    const mobileCaptures = new Set(['units', 'unit-detail', 'inspection', 'stock']);

    for (const viewport of [
      { width: 1440, height: 1000 },
      { width: 360, height: 800 },
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
        if (viewport.width === 360) {
          const currentNavigationItem = page
            .getByRole('navigation', { name: 'Các mục quản lý kho' })
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
          process.env['FE06_CAPTURE_SCREENSHOTS'] === '1' &&
          (viewport.width === 1440 || mobileCaptures.has(screen.slug))
        ) {
          await page.screenshot({
            animations: 'disabled',
            path: `docs/assets/ui/fe-06/${screen.slug}-${String(viewport.width)}.png`,
          });
        }
      }
    }
    expect(browserErrors).toEqual([]);
  });
});

async function installFe06Api(page: Page, role: StaffRole): Promise<Fe06Probe> {
  const probe: Fe06Probe = {
    costRequests: 0,
    inspectionCompleteRequests: 0,
    inspectionPatchBodies: [],
    inspectionStatus: 'DRAFT',
    inspectionValues: {},
    lookupBody: null,
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
    if (pathname.endsWith('/backoffice/inventory-units/lookup-identifier') && method === 'POST') {
      probe.lookupBody = requestJson(route);
      await fulfillJson(route, { data: inventoryUnit() });
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
      await fulfillJson(route, paged([inspectionSummary(probe)], 50));
      return;
    }
    if (pathname.endsWith(`/backoffice/inventory-units/${UNIT_ID}`) && method === 'GET') {
      await fulfillJson(route, { data: inventoryUnit() });
      return;
    }
    if (pathname.endsWith('/backoffice/inventory-units') && method === 'GET') {
      probe.unitListQueries.push(url.searchParams.toString());
      await fulfillJson(
        route,
        paged([inventoryUnit()], Number(url.searchParams.get('pageSize')) || 20),
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

function inventoryUnit() {
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
      batteryHealthPercent: null,
      conditionGrade: null,
      id: INSPECTION_ID,
      inspectedAt: null,
      overallResult: 'INCOMPLETE',
    },
    id: UNIT_ID,
    inventoryCode: 'RPH-FE06-0001',
    lifecycleStatus: 'INSPECTING',
    location: inventoryLocations()[0],
    maskedIdentifiers: [{ maskedValue: '***********7518', type: 'IMEI_1' }],
    media: [],
    mediaCount: 0,
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

function inspectionSummary(probe: Fe06Probe) {
  return {
    createdAt: '2026-08-28T06:15:00.000Z',
    id: INSPECTION_ID,
    inspectedAt: probe.inspectionStatus === 'COMPLETED' ? '2026-08-28T08:10:00.000Z' : null,
    inspectionType: 'PRE_SALE',
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
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
}
