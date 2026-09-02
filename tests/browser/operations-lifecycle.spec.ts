import AxeBuilder from '@axe-core/playwright';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { expect, test, type Locator, type Page, type Route } from '@playwright/test';
import { browserTestTitle as bt } from '../../apps/web/lib/frontend-browser-coverage';
import { stabilizeVisualPage } from './support/stabilize-visual-page';

const ID = '0199d009-0000-7000-8000-000000000001';
type Role = 'ADMIN' | 'EMPLOYEE';
interface Probe {
  commands: Array<{ body: unknown; path: string }>;
  evidence: number;
  holdNextOrderQueueRefresh(): ControlledOrderQueueRequest;
  reads: string[];
}

interface ControlledOrderQueueRequest {
  release(): void;
  state(): 'waiting' | 'started' | 'completed';
}

interface OrderQueueRequestGate extends ControlledOrderQueueRequest {
  readonly released: Promise<void>;
  markCompleted(): void;
  markStarted(): void;
}

type OrderFlow = 'pickup' | 'shipping-delivery' | 'shipping-return';
interface FixtureOptions {
  readonly orderConflictOnce?: boolean;
  readonly orderFlow?: OrderFlow;
  readonly orderInitialStage?: number;
  readonly orderQueueRefresh?: boolean;
}
interface OrderFixtureState {
  readonly flow: OrderFlow;
  stage: number;
}

const ROUTES = [
  ['/backoffice/orders', 'Đơn hàng'],
  [`/backoffice/orders/${ID}`, 'RPH-FE09-0001'],
  ['/backoffice/payments', 'Duyệt thanh toán'],
  [`/backoffice/payments/${ID}`, 'RPH-FE09-0001'],
  ['/backoffice/refunds', 'Hoàn tiền'],
  [`/backoffice/refunds/${ID}`, 'RPH-FE09-0001'],
  ['/backoffice/after-sales', 'Hỗ trợ sau mua'],
  [`/backoffice/after-sales/${ID}`, 'RPH-AS-FE09'],
  ['/backoffice/warranties', 'Bảo hành đã cấp'],
  [`/backoffice/warranties/${ID}`, 'RPH-W-FE09'],
  ['/backoffice/warranty-policies', 'Chính sách bảo hành'],
] as const;

test.describe('FE-09 operations lifecycle through the rendered UI', () => {
  test(bt('browser:operations-lifecycle', 'staff-route-state-matrix'), async ({ page }) => {
    test.slow();
    for (const viewport of [
      { width: 1440, height: 900 },
      { width: 390, height: 844 },
    ]) {
      await page.setViewportSize(viewport);
      for (const [route, text] of ROUTES) {
        const isolated = await page.context().newPage();
        await isolated.setViewportSize(viewport);
        await fixture(isolated, 'EMPLOYEE');
        await isolated.goto(route, { waitUntil: 'domcontentloaded' });
        await expect(isolated.locator('[data-shell="backoffice"]')).toHaveCount(1);
        await expect(isolated.locator('main')).toContainText(text);
        if (route === `/backoffice/orders/${ID}` && viewport.width === 1440) {
          const email = isolated.getByText('khach@example.com', { exact: true });
          await expect(email).toBeVisible();
          const emailLayout = await email.evaluate((element) => ({
            clientWidth: element.clientWidth,
            scrollWidth: element.scrollWidth,
            singleLine: getComputedStyle(element).whiteSpace === 'nowrap',
          }));
          expect(
            emailLayout,
            'Email phổ biến phải hiển thị trọn vẹn trên một dòng ở trang chi tiết đơn desktop',
          ).toMatchObject({ singleLine: true });
          expect(emailLayout.scrollWidth).toBeLessThanOrEqual(emailLayout.clientWidth);
        }
        const size = await isolated.evaluate(() => ({
          client: document.documentElement.clientWidth,
          scroll: document.documentElement.scrollWidth,
        }));
        expect(size.scroll, `${route} không tràn ngang`).toBeLessThanOrEqual(size.client);
        const axe = await new AxeBuilder({ page: isolated }).exclude('nextjs-portal').analyze();
        expect(
          axe.violations.filter(({ impact }) => impact === 'serious' || impact === 'critical'),
        ).toEqual([]);
        if (process.env['FE09_CAPTURE_SCREENSHOTS'] === '1')
          await capture(isolated, route, viewport.width);
        await isolated.close();
      }
    }

    for (const viewport of [
      { name: 'mobile-320', width: 320, height: 844 },
      { name: 'mobile-390', width: 390, height: 844 },
      { name: 'tablet-768', width: 768, height: 1024 },
      { name: 'desktop-1024', width: 1024, height: 768 },
      { name: 'desktop-1440', width: 1440, height: 900 },
    ] as const) {
      const isolated = await page.context().newPage();
      await isolated.setViewportSize({ width: viewport.width, height: viewport.height });
      await fixture(isolated, 'EMPLOYEE', {
        orderFlow: 'shipping-delivery',
        orderInitialStage: 2,
      });
      await isolated.goto(`/backoffice/orders/${ID}`, { waitUntil: 'domcontentloaded' });
      await expect(
        isolated
          .getByRole('region', { name: 'Tổng quan đơn hàng' })
          .getByText('Đang giao hàng', { exact: true }),
      ).toBeVisible();
      const deliveryAction = isolated.getByRole('button', {
        name: 'Xác nhận giao thành công',
        exact: true,
      });
      await expect(deliveryAction).toHaveAttribute('aria-pressed', 'true');
      await expectNoDocumentOverflow(isolated, `order processing ${viewport.name}`);
      await expectStickyTopbarAndReachableAction(isolated, deliveryAction);
      const detailRail = isolated.locator('aside[class*="orderDetailRail"]');
      await expect(detailRail).toHaveCSS('position', viewport.width >= 1024 ? 'sticky' : 'static');

      if (viewport.name === 'desktop-1440' || viewport.name === 'mobile-390') {
        await prepareWp11Visual(isolated);
        await expect(isolated).toHaveScreenshot(
          `wp11-operations-order-processing-${viewport.name}.png`,
          {
            animations: 'disabled',
            caret: 'hide',
            fullPage: true,
          },
        );
      }
      await isolated.close();
    }
  });

  test(bt('browser:operations-lifecycle', 'order-pickup-lifecycle'), async ({ page }) => {
    const probe = await fixture(page, 'EMPLOYEE', { orderFlow: 'pickup' });
    await page.goto(`/backoffice/orders/${ID}`);

    await submitOrderAction(page, 'Xác nhận đơn hàng', { doubleClick: true });
    await submitOrderAction(page, 'Bắt đầu chuẩn bị hàng');
    await submitOrderAction(page, 'Gia hạn giữ hàng', async (form) => {
      await form.getByLabel('Hạn giữ hàng mới').fill('2026-09-04T10:00');
      await form.getByLabel('Lý do gia hạn').fill('Khách hẹn lại thời gian nhận máy');
    });
    await submitOrderAction(page, 'Sẵn sàng nhận tại cửa hàng');
    await submitOrderAction(page, 'Hoàn tất giao tại cửa hàng');

    expect(probe.commands.map(({ path }) => path)).toEqual(
      [
        'confirm',
        'start-preparing',
        'extend-pickup-hold',
        'mark-pickup-ready',
        'complete-pickup',
      ].map((name) => `/api/v1/backoffice/orders/${ID}/${name}`),
    );

    const conflictPage = await page.context().newPage();
    const conflictProbe = await fixture(conflictPage, 'EMPLOYEE', {
      orderConflictOnce: true,
      orderFlow: 'pickup',
    });
    await conflictPage.goto(`/backoffice/orders/${ID}`);
    const choice = conflictPage.getByRole('button', { name: 'Xác nhận đơn hàng', exact: true });
    await choice.click();
    const disclosure = conflictPage
      .locator('details')
      .filter({ hasText: 'Chi tiết xác nhận đơn hàng' });
    await disclosure.locator('summary').click();
    await disclosure.getByRole('button', { name: /^Xác nhận / }).click();
    await expect(
      conflictPage.getByText('Đơn vừa được xử lý ở phiên khác. Hãy tải lại.', { exact: true }),
    ).toBeVisible();
    await expectNoSeriousAxeViolations(conflictPage);
    await expect(choice).toBeEnabled();
    await submitOrderAction(conflictPage, 'Xác nhận đơn hàng');
    expect(conflictProbe.commands.map(({ path }) => path)).toEqual([
      `/api/v1/backoffice/orders/${ID}/confirm`,
      `/api/v1/backoffice/orders/${ID}/confirm`,
    ]);
    await conflictPage.close();
  });

  test(bt('browser:operations-lifecycle', 'order-shipping-lifecycle'), async ({ page }) => {
    const probe = await fixture(page, 'EMPLOYEE', { orderFlow: 'shipping-return' });
    await page.goto(`/backoffice/orders/${ID}`);

    await submitOrderAction(page, 'Tạo vận đơn', async (form) => {
      await form.getByLabel('Đơn vị vận chuyển').fill('Vận chuyển FE09');
      await form.getByLabel('Mã vận đơn').fill('TRACK-RETURN-09');
    });
    await submitOrderAction(page, 'Bàn giao cho đơn vị vận chuyển');
    await submitOrderAction(page, 'Ghi nhận giao hàng thất bại', async (form) => {
      await form.getByLabel('Lý do giao thất bại').fill('Khách chưa thể nhận kiện hàng');
    });
    await submitOrderAction(page, 'Xác nhận hàng hoàn đã về', async (form) => {
      await form.getByLabel('Địa điểm nhận hàng hoàn').selectOption('location-1');
      await form.getByLabel('Ghi chú kiểm nhận').fill('Kho đã nhận và kiểm đếm kiện hoàn');
    });
    expect(probe.commands.map(({ path }) => path)).toEqual([
      `/api/v1/backoffice/orders/${ID}/shipment`,
      `/api/v1/backoffice/shipments/${ID}/hand-over`,
      `/api/v1/backoffice/shipments/${ID}/mark-failed`,
      `/api/v1/backoffice/shipments/${ID}/mark-returned`,
    ]);

    const delivered = await page.context().newPage();
    const deliveredProbe = await fixture(delivered, 'EMPLOYEE', { orderFlow: 'shipping-delivery' });
    await delivered.goto(`/backoffice/orders/${ID}`);
    await submitOrderAction(delivered, 'Tạo vận đơn', async (form) => {
      await form.getByLabel('Đơn vị vận chuyển').fill('Vận chuyển FE09');
      await form.getByLabel('Mã vận đơn').fill('TRACK-DELIVERY-09');
    });
    await submitOrderAction(delivered, 'Bàn giao cho đơn vị vận chuyển');
    await submitOrderAction(delivered, 'Xác nhận giao thành công');
    expect(deliveredProbe.commands.map(({ path }) => path)).toEqual([
      `/api/v1/backoffice/orders/${ID}/shipment`,
      `/api/v1/backoffice/shipments/${ID}/hand-over`,
      `/api/v1/backoffice/shipments/${ID}/mark-delivered`,
    ]);
    await delivered.close();
  });

  test(bt('browser:operations-lifecycle', 'queue-local-refresh'), async ({ page }) => {
    const probe = await fixture(page, 'EMPLOYEE', { orderQueueRefresh: true });
    await page.goto('/backoffice/orders');
    await expect(page.getByText('iPhone hàng chờ 01', { exact: true })).toBeVisible();
    const navigationCount = await page.evaluate(
      () => performance.getEntriesByType('navigation').length,
    );

    await page.getByLabel('Tìm đơn hàng').fill('RPH-FE09-NEW');
    const pendingRefresh = probe.holdNextOrderQueueRefresh();
    let scrollBefore = 0;
    try {
      await Promise.all([
        page.waitForRequest((request) => {
          const url = new URL(request.url());
          return (
            request.method() === 'GET' &&
            url.pathname === '/api/v1/backoffice/orders' &&
            url.searchParams.get('q') === 'RPH-FE09-NEW'
          );
        }),
        page.getByRole('button', { name: 'Lọc đơn hàng' }).click(),
      ]);
      await expect.poll(() => pendingRefresh.state()).toBe('started');
      await expect(page.getByText('Đang cập nhật danh sách…', { exact: true })).toBeVisible();
      await expect(page.getByText('iPhone hàng chờ 01', { exact: true })).toBeVisible();
      await page.evaluate(() => {
        window.scrollTo(0, 620);
      });
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(500);
      scrollBefore = await page.evaluate(() => window.scrollY);
    } finally {
      pendingRefresh.release();
    }
    await expect.poll(() => pendingRefresh.state()).toBe('completed');

    await expect(page.getByText('Kết quả bộ lọc FE09', { exact: true })).toBeVisible();
    expect(
      Math.abs((await page.evaluate(() => window.scrollY)) - scrollBefore),
    ).toBeLessThanOrEqual(16);
    await expect(page.getByRole('button', { name: 'Lọc đơn hàng' })).toBeFocused();
    expect(await page.evaluate(() => performance.getEntriesByType('navigation').length)).toBe(
      navigationCount,
    );
    await expect(page).toHaveURL(/q=RPH-FE09-NEW/);
    expect(probe.reads.filter((path) => path.includes('q=RPH-FE09-NEW'))).toHaveLength(1);
  });
});

async function submitOrderAction(
  page: Page,
  actionLabel: string,
  configure?: ((form: Locator) => Promise<void>) | { readonly doubleClick: true },
): Promise<void> {
  const choice = page.getByRole('button', { name: actionLabel, exact: true });
  await expect(choice).toBeVisible();
  await choice.click();
  const detailLabel = `Chi tiết ${actionLabel.toLocaleLowerCase('vi-VN')}`;
  const disclosure = page.locator('details').filter({ hasText: detailLabel });
  if ((await disclosure.getAttribute('open')) === null) await disclosure.locator('summary').click();
  const form = disclosure.locator('form');
  if (typeof configure === 'function') await configure(form);
  const submit = form.getByRole('button', { name: /^Xác nhận / });
  const request = page.waitForRequest(
    (candidate) => candidate.method() === 'POST' && candidate.url().includes('/api/v1/backoffice/'),
  );
  if (typeof configure === 'object') await submit.dblclick();
  else await submit.click();
  await request;
  await expect(disclosure).toHaveCount(0);
}

async function fixture(page: Page, role: Role, options: FixtureOptions = {}): Promise<Probe> {
  let nextOrderQueueRefresh: OrderQueueRequestGate | undefined;
  const probe: Probe = {
    commands: [],
    evidence: 0,
    holdNextOrderQueueRefresh() {
      const gate = createOrderQueueRequestGate();
      nextOrderQueueRefresh = gate;
      return gate;
    },
    reads: [],
  };
  let orderConflictPending = options.orderConflictOnce === true;
  const orderState: OrderFixtureState | null =
    options.orderFlow === undefined
      ? null
      : { flow: options.orderFlow, stage: options.orderInitialStage ?? 0 };
  await page.route('**/api/v1/auth/refresh', (route) =>
    json(route, { data: { accessToken: `fe09-${role}`, user: staff(role) } }),
  );
  await page.route('**/api/v1/backoffice/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const apiPath = url.pathname;
    const method = request.method();
    if (method === 'OPTIONS') return preflight(route);
    if (method === 'GET') probe.reads.push(`${apiPath}${url.search}`);
    else probe.commands.push({ body: safeBody(route), path: apiPath });
    if (apiPath.includes('evidence-url') || apiPath.endsWith('/url')) {
      probe.evidence += 1;
      if (apiPath.includes('provider-error')) return json(route, err('SERVICE_UNAVAILABLE'), 503);
      return json(route, {
        data: {
          expiresAt: '2026-09-02T12:05:00.000Z',
          url: apiPath.includes('unsafe')
            ? 'javascript:alert(1)'
            : `https://evidence.example/safe-${String(probe.evidence)}?token=fresh`,
        },
      });
    }
    if (url.searchParams.get('conflict') === '1')
      return json(route, err('CONCURRENT_MODIFICATION'), 409);
    if (
      method !== 'GET' &&
      role === 'EMPLOYEE' &&
      (apiPath.endsWith('/void') || apiPath.endsWith('/resolve-other'))
    )
      return json(route, err('FORBIDDEN'), 403);
    if (method !== 'GET' && orderState !== null && isOrderCommand(apiPath)) {
      if (orderConflictPending) {
        orderConflictPending = false;
        return json(route, err('CONCURRENT_MODIFICATION'), 409);
      }
      if (!advanceOrder(orderState, apiPath))
        return json(route, err('CONCURRENT_MODIFICATION'), 409);
      return json(route, { data: orderForState(orderState) });
    }
    if (method !== 'GET') return json(route, { data: detailFor(apiPath, role) });
    if (apiPath.endsWith('/inventory-locations'))
      return json(route, {
        data: [
          {
            code: 'HCM-01',
            id: 'location-1',
            name: 'Cửa hàng Hồ Chí Minh',
            status: 'ACTIVE',
            type: 'STORE',
          },
        ],
      });
    if (apiPath.endsWith('/orders') && options.orderQueueRefresh === true) {
      const filtered = url.searchParams.get('q') === 'RPH-FE09-NEW';
      const refreshGate = filtered ? nextOrderQueueRefresh : undefined;
      if (refreshGate !== undefined) {
        nextOrderQueueRefresh = undefined;
        refreshGate.markStarted();
        await refreshGate.released;
        try {
          await json(route, paged(filteredOrderQueueItems()));
        } finally {
          refreshGate.markCompleted();
        }
        return;
      }
      return json(route, paged(filtered ? filteredOrderQueueItems() : orderQueueItems()));
    }
    if (apiPath.endsWith(`/orders/${ID}`) && orderState !== null)
      return json(route, { data: orderForState(orderState) });
    if (apiPath.endsWith(`/${ID}`)) return json(route, { data: detailFor(apiPath, role) });
    if (/\/(orders|payments|refunds|after-sales|warranties|warranty-policies)$/.test(apiPath))
      return json(route, paged([]));
    return json(route, err('RESOURCE_NOT_FOUND'), 404);
  });
  return probe;
}

function detailFor(apiPath: string, role: Role): Record<string, unknown> {
  if (apiPath.includes('/payments/')) return payment();
  if (apiPath.includes('/refunds/')) return refund();
  if (apiPath.includes('/after-sales/')) return afterSales();
  if (apiPath.includes('/warranty-policies')) return policy();
  if (apiPath.includes('/warranties/')) return warranty(role);
  return order();
}

function isOrderCommand(apiPath: string): boolean {
  return (
    apiPath.startsWith(`/api/v1/backoffice/orders/${ID}/`) ||
    apiPath.startsWith(`/api/v1/backoffice/shipments/${ID}/`)
  );
}

function advanceOrder(state: OrderFixtureState, apiPath: string): boolean {
  if (state.flow === 'pickup') {
    const expected = [
      `/api/v1/backoffice/orders/${ID}/confirm`,
      `/api/v1/backoffice/orders/${ID}/start-preparing`,
      `/api/v1/backoffice/orders/${ID}/extend-pickup-hold`,
      `/api/v1/backoffice/orders/${ID}/mark-pickup-ready`,
      `/api/v1/backoffice/orders/${ID}/complete-pickup`,
    ];
    if (apiPath !== expected[state.stage]) return false;
    state.stage += 1;
    return true;
  }
  const expected =
    state.stage === 0
      ? `/api/v1/backoffice/orders/${ID}/shipment`
      : state.stage === 1
        ? `/api/v1/backoffice/shipments/${ID}/hand-over`
        : state.stage === 2
          ? `/api/v1/backoffice/shipments/${ID}/${state.flow === 'shipping-return' ? 'mark-failed' : 'mark-delivered'}`
          : `/api/v1/backoffice/shipments/${ID}/mark-returned`;
  if (apiPath !== expected) return false;
  state.stage += 1;
  return true;
}

function orderForState(state: OrderFixtureState): Record<string, unknown> {
  if (state.flow === 'pickup') {
    const actions = [
      ['CONFIRM'],
      ['START_PREPARING'],
      ['EXTEND_PICKUP_HOLD'],
      ['MARK_PICKUP_READY'],
      ['COMPLETE_PICKUP'],
      [],
    ];
    return {
      ...order(),
      availableActions: actions[state.stage] ?? [],
      completedAt: state.stage >= 5 ? '2026-09-02T10:00:00.000Z' : null,
      confirmedAt: state.stage >= 1 ? '2026-09-02T08:15:00.000Z' : null,
      fulfillmentStatus:
        state.stage >= 5
          ? 'COMPLETED'
          : state.stage >= 4
            ? 'READY'
            : state.stage >= 2
              ? 'PREPARING'
              : 'PENDING',
      pickedUpAt: state.stage >= 5 ? '2026-09-02T10:00:00.000Z' : null,
      pickupHoldUntil: state.stage >= 3 ? '2026-09-04T10:00:00.000Z' : '2026-09-03T10:00:00.000Z',
      pickupReadyAt: state.stage >= 4 ? '2026-09-02T09:30:00.000Z' : null,
      status: state.stage >= 5 ? 'COMPLETED' : state.stage >= 1 ? 'CONFIRMED' : 'PLACED',
    };
  }
  const returned = state.flow === 'shipping-return';
  const actions =
    state.stage === 0
      ? ['CREATE_SHIPMENT']
      : state.stage === 1
        ? ['HAND_OVER_SHIPMENT']
        : state.stage === 2
          ? [returned ? 'MARK_SHIPMENT_FAILED' : 'MARK_SHIPMENT_DELIVERED']
          : state.stage === 3 && returned
            ? ['MARK_SHIPMENT_RETURNED']
            : [];
  return {
    ...order(),
    availableActions: actions,
    confirmedAt: '2026-09-02T08:15:00.000Z',
    fulfillmentStatus:
      state.stage >= 4 && returned
        ? 'RETURNED'
        : state.stage >= 3 && !returned
          ? 'COMPLETED'
          : state.stage >= 3
            ? 'FAILED'
            : state.stage >= 2
              ? 'IN_TRANSIT'
              : 'PREPARING',
    fulfillmentType: 'SHIPPING',
    location: { code: 'HCM-01', id: 'location-1', name: 'Cửa hàng Hồ Chí Minh', type: 'STORE' },
    pickupStore: null,
    shipments: state.stage === 0 ? [] : [shipmentForState(state)],
    shippingAddress: {
      city: 'Thành phố Hồ Chí Minh',
      line1: '1 Đường FE09',
      recipientName: 'Khách FE09',
      recipientPhone: '0900000000',
    },
    status: state.stage >= 3 && !returned ? 'COMPLETED' : 'CONFIRMED',
  };
}

function shipmentForState(state: OrderFixtureState): Record<string, unknown> {
  const returned = state.flow === 'shipping-return';
  return {
    attemptNumber: 1,
    carrierName: 'Vận chuyển FE09',
    createdAt: '2026-09-02T08:30:00.000Z',
    createdBy: { employeeCode: 'NV09', fullName: 'Nhân viên FE09', id: 'staff-EMPLOYEE' },
    deliveredAt: state.stage >= 3 && !returned ? '2026-09-02T10:00:00.000Z' : null,
    failedAt: state.stage >= 3 && returned ? '2026-09-02T09:30:00.000Z' : null,
    failureReason: state.stage >= 3 && returned ? 'Khách chưa thể nhận kiện hàng' : null,
    id: ID,
    orderId: ID,
    returnedAt: state.stage >= 4 && returned ? '2026-09-02T10:30:00.000Z' : null,
    returnedToLocation:
      state.stage >= 4 && returned
        ? { code: 'HCM-01', id: 'location-1', name: 'Cửa hàng Hồ Chí Minh', type: 'STORE' }
        : null,
    returnNote: state.stage >= 4 && returned ? 'Kho đã nhận và kiểm đếm kiện hoàn' : null,
    shippedAt: state.stage >= 2 ? '2026-09-02T09:00:00.000Z' : null,
    status:
      state.stage >= 4 && returned
        ? 'RETURNED'
        : state.stage >= 3 && returned
          ? 'FAILED'
          : state.stage >= 3
            ? 'DELIVERED'
            : state.stage >= 2
              ? 'HANDED_TO_CARRIER'
              : 'CREATED',
    trackingCode: 'TRACK-FE09',
    trackingUrl: 'https://tracking.example/fe09',
    updatedAt: '2026-09-02T09:00:00.000Z',
  };
}

function orderQueueItems(): Record<string, unknown>[] {
  return Array.from({ length: 18 }, (_, index) => orderQueueItem(index + 1, false));
}

function filteredOrderQueueItems(): Record<string, unknown>[] {
  return Array.from({ length: 18 }, (_, index) => orderQueueItem(index + 81, true));
}

function orderQueueItem(index: number, filtered: boolean): Record<string, unknown> {
  const suffix = String(index).padStart(2, '0');
  return {
    availableActions: [],
    balanceDue: '0',
    contactEmail: `khach-${suffix}@example.com`,
    contactName: `Khách hàng ${suffix}`,
    firstItemName: filtered
      ? index === 81
        ? 'Kết quả bộ lọc FE09'
        : `Kết quả bộ lọc FE09 ${suffix}`
      : `iPhone hàng chờ ${suffix}`,
    fulfillmentStatus: 'PENDING',
    fulfillmentType: 'PICKUP',
    grandTotal: '1000000',
    id: `${ID.slice(0, -2)}${suffix}`,
    location: { code: 'HCM-01', id: 'location-1', name: 'Cửa hàng Hồ Chí Minh', type: 'STORE' },
    orderNumber: filtered ? 'RPH-FE09-NEW' : `RPH-FE09-${suffix}`,
    paymentStatus: 'PAID',
    pickupHoldUntil: '2026-09-05T10:00:00.000Z',
    pickupOverdue: false,
    placedAt: '2026-09-02T08:00:00.000Z',
    status: 'PLACED',
    totalItemQuantity: 1,
    updatedAt: '2026-09-02T08:00:00.000Z',
  };
}

function order() {
  return {
    availableActions: [],
    contact: { email: 'khach@example.com', fullName: 'Khách FE09', phone: '0900000000' },
    fulfillmentStatus: 'PENDING',
    fulfillmentType: 'PICKUP',
    id: ID,
    items: [
      {
        id: 'order-item-fe09',
        inventoryCode: 'RPH-U-FE09',
        lineTotal: '1000000',
        productName: 'iPhone 17 Pro',
        quantity: 1,
        sku: 'IP17P-256-BLU',
        unitPrice: '1000000',
        variantName: '256 GB · Xanh đậm',
        warranty: null,
        warrantyDays: 90,
      },
    ],
    location: null,
    orderNumber: 'RPH-FE09-0001',
    paymentAttempts: [],
    paymentStatus: 'PAID',
    pickupStore: { code: 'HCM-01', id: 'location-1', name: 'Cửa hàng Hồ Chí Minh', type: 'STORE' },
    placedAt: '2026-09-02T08:00:00.000Z',
    pricing: {
      balanceDue: '0',
      depositRequired: '0',
      grandTotal: '1000000',
      paidAmount: '1000000',
      refundedAmount: '0',
      shippingFee: '0',
      shippingFeeOriginal: '0',
      shippingFeeOverride: null,
      subtotal: '1000000',
      voucherDiscountAmount: '0',
    },
    refundableAmount: '1000000',
    refunds: [],
    reservations: [],
    shipments: [],
    shippingAddress: null,
    status: 'PLACED',
  };
}
function payment() {
  return {
    availableActions: [],
    evidenceAvailable: true,
    order: {
      balanceDue: '1000000',
      contact: { email: 'khach@example.com', fullName: 'Khách FE09', phone: '0900000000' },
      depositRequired: '3000000',
      fulfillmentStatus: 'PENDING',
      grandTotal: '13000000',
      items: [],
      orderNumber: 'RPH-FE09-0001',
      paidAmount: '0',
      paymentStatus: 'DEPOSIT_PENDING',
      refundedAmount: '0',
      status: 'PLACED',
    },
    payment: {
      expectedAmount: '3000000',
      id: ID,
      method: 'BANK_TRANSFER',
      orderNumber: 'RPH-FE09-0001',
      purpose: 'DEPOSIT',
      status: 'UNDER_REVIEW',
      submittedAt: '2026-09-02T08:00:00.000Z',
      transferContent: 'RPHFE09',
    },
    reviewNote: null,
    reviewedAt: null,
    reviewer: null,
    timeline: [],
  };
}
function refund() {
  return {
    amount: '3000000',
    availableActions: [],
    completedAt: null,
    createdAt: '2026-09-02T08:00:00.000Z',
    evidenceAvailable: false,
    id: ID,
    method: 'BANK_TRANSFER',
    note: null,
    order: {
      balanceDue: '10000000',
      customerEmail: 'khach@example.com',
      customerName: 'Khách FE09',
      fulfillmentStatus: 'CANCELLED',
      grandTotal: '13000000',
      id: ID,
      orderNumber: 'RPH-FE09-0001',
      paidAmount: '3000000',
      paymentStatus: 'REFUND_PENDING',
      refundedAmount: '0',
      status: 'CANCELLED',
    },
    orderNumber: 'RPH-FE09-0001',
    payment: null,
    processingAt: null,
    processor: null,
    reason: 'Hoàn tiền FE09',
    requestedByType: 'STAFF',
    requester: null,
    status: 'REQUESTED',
    terminalActor: null,
    terminalAt: null,
    terminalReason: null,
  };
}
function afterSales() {
  return {
    assignedTo: { fullName: 'Nhân viên FE09', id: 'staff-1' },
    attachmentCount: 1,
    attachments: [
      {
        fileSize: 2048,
        id: ID,
        mimeType: 'image/png',
        uploadedAt: '2026-09-02T08:05:00.000Z',
      },
    ],
    availableActions: [],
    cancelReason: null,
    customer: {
      email: 'khach@example.com',
      id: 'customer-1',
      name: 'Khách FE09',
      phone: '0900000000',
    },
    decidedBy: null,
    decisionNote: null,
    id: ID,
    inspection: null,
    inspectionSummary: null,
    issueDescription: 'Máy cần kiểm tra trong hợp đồng FE09.',
    orderItem: {
      id: 'order-item-1',
      inventoryCode: 'RPH-U-FE09',
      orderNumber: 'RPH-FE09-0001',
      productName: 'iPhone 17 Pro',
      quantity: 1,
      variantName: '256 GB · Xanh đậm',
    },
    receiveNote: null,
    receivedBy: null,
    receivedLocation: null,
    refund: null,
    replacementUnit: null,
    requestedAt: '2026-09-02T08:00:00.000Z',
    requestedResolution: 'Kiểm tra và xử lý máy',
    requestNumber: 'RPH-AS-FE09',
    resolutionNote: null,
    resolutionType: null,
    resolvedBy: null,
    returnNote: null,
    status: 'REQUESTED',
    timeline: {
      cancelledAt: null,
      decidedAt: null,
      inspectedAt: null,
      receivedAt: null,
      requestedAt: '2026-09-02T08:00:00.000Z',
      resolvedAt: null,
      returnedAt: null,
    },
    type: 'WARRANTY',
    updatedAt: '2026-09-02T08:00:00.000Z',
    warranty: null,
  };
}
function warranty(role: Role) {
  return {
    availableActions: role === 'ADMIN' ? ['VOID'] : [],
    createdAt: '2026-09-02T08:00:00.000Z',
    customer: {
      customerId: 'customer-1',
      email: 'khach@example.com',
      name: 'Khách FE09',
      phone: '0900000000',
    },
    daysSnapshot: 90,
    endAt: '2026-12-01T00:00:00.000Z',
    id: ID,
    inventoryCode: 'RPH-U-FE09',
    isExpired: false,
    isValid: true,
    maskedIdentifierSuffix: '0909',
    orderItemId: 'order-item-1',
    orderNumber: 'RPH-FE09-0001',
    policy: { code: 'BH-90', id: ID, name: 'Bảo hành 90 ngày' },
    productName: 'iPhone 17 Pro',
    sku: 'IP17P-256-BLU',
    startAt: '2026-09-02T00:00:00.000Z',
    status: 'ACTIVE',
    termsSnapshot: 'Điều khoản bảo hành FE09.',
    updatedAt: '2026-09-02T08:00:00.000Z',
    variantName: '256 GB · Xanh đậm',
    voidedAt: null,
    voidedBy: null,
    voidReason: null,
    warrantyCode: 'RPH-W-FE09',
  };
}
function policy() {
  return {
    archivedAt: null,
    archiveBlockedReason: null,
    availableActions: [],
    code: 'FE09',
    createdAt: '2026-09-02T08:00:00.000Z',
    defaultDays: 90,
    id: ID,
    isArchived: false,
    name: 'Chính sách FE09',
    status: 'INACTIVE',
    terms: 'Điều khoản bảo hành FE09.',
    updatedAt: '2026-09-02T08:00:00.000Z',
  };
}
function staff(role: Role) {
  return {
    email: `${role.toLowerCase()}@rephone.local`,
    fullName: role === 'ADMIN' ? 'Quản trị FE09' : 'Nhân viên FE09',
    id: `staff-${role}`,
    phone: '0900000909',
    role,
    status: 'ACTIVE',
  };
}
function paged(data: unknown[]) {
  return {
    data,
    meta: {
      pagination: {
        page: 1,
        pageSize: 20,
        totalItems: data.length,
        totalPages: data.length === 0 ? 0 : 1,
      },
    },
  };
}
function err(code: string) {
  return {
    error: { code, details: [], message: `Lỗi giả lập ${code}`, requestId: `fe09-${code}` },
  };
}
function safeBody(route: Route): unknown {
  try {
    const raw = route.request().postData();
    return raw === null ? null : (JSON.parse(raw) as unknown);
  } catch {
    return route.request().postData();
  }
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

function createOrderQueueRequestGate(): OrderQueueRequestGate {
  let state: ReturnType<ControlledOrderQueueRequest['state']> = 'waiting';
  let release = () => undefined;
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  return {
    markCompleted() {
      state = 'completed';
    },
    markStarted() {
      state = 'started';
    },
    release,
    released,
    state: () => state,
  };
}

async function preflight(route: Route) {
  await route.fulfill({
    headers: {
      'access-control-allow-credentials': 'true',
      'access-control-allow-headers': 'authorization,content-type',
      'access-control-allow-methods': 'GET,POST,PATCH,OPTIONS',
      'access-control-allow-origin': 'http://localhost:3001',
    },
    status: 204,
  });
}
async function capture(page: Page, route: string, width: number) {
  const directory = path.resolve('.local/fe09/wp09-audit');
  await mkdir(directory, { recursive: true });
  await page.locator('nextjs-portal').evaluateAll((nodes) => {
    nodes.forEach((node) => {
      node.remove();
    });
  });
  const routeWithoutPrefix = route.replace(/^\/backoffice\/?/, '');
  const slug: string =
    routeWithoutPrefix.length === 0 ? 'overview' : routeWithoutPrefix.split('/').join('-');
  await page.screenshot({
    animations: 'disabled',
    fullPage: true,
    path: path.join(directory, `${slug}-${String(width)}.png`),
  });
}

async function expectNoDocumentOverflow(page: Page, label: string): Promise<void> {
  const size = await page.evaluate(() => ({
    client: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  expect(size.scroll, `${label} không tràn ngang`).toBeLessThanOrEqual(size.client);
}

async function expectNoSeriousAxeViolations(page: Page): Promise<void> {
  const axe = await new AxeBuilder({ page }).exclude('nextjs-portal').analyze();
  expect(
    axe.violations.filter(({ impact }) => impact === 'serious' || impact === 'critical'),
  ).toEqual([]);
}

async function expectStickyTopbarAndReachableAction(page: Page, action: Locator): Promise<void> {
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
