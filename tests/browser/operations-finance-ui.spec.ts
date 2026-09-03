import { expect, test, type BrowserContext, type Page, type Route } from '@playwright/test';
import { browserTestTitle as bt } from '../../apps/web/lib/frontend-browser-coverage';

const ID = '0199d009-0000-7000-8000-000000000071';

interface FinanceProbe {
  conflictNext: boolean;
  evidenceAvailable: boolean;
  evidenceMode: 'provider' | 'safe' | 'unsafe';
  evidenceRequests: number;
  mutations: string[];
  paymentStatus: 'REJECTED' | 'UNDER_REVIEW' | 'VERIFIED';
  refundMethod: 'BANK_TRANSFER' | 'CASH';
  refundStatus: 'PROCESSING' | 'REQUESTED' | 'COMPLETED';
  refundEvidence: boolean;
}

test.describe('WP09 finance operations through the rendered UI', () => {
  test(bt('browser:operations-lifecycle', 'payment-review-evidence'), async ({ page, context }) => {
    const probe = await installFinanceFixture(page, context, 'payment');
    await page.goto(`/backoffice/payments/${ID}`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { level: 1, name: 'RPH-FE09-FINANCE' })).toBeVisible();

    for (const expected of ['safe-1', 'safe-2']) {
      const popupPromise = context.waitForEvent('page');
      await page.getByRole('button', { name: 'Mở minh chứng' }).click();
      const popup = await popupPromise;
      await popup.waitForURL(new RegExp(expected));
      expect(popup.url()).toContain('https://evidence.example/');
      await popup.close();
    }
    expect(probe.evidenceRequests).toBe(2);

    probe.evidenceMode = 'unsafe';
    await page.getByRole('button', { name: 'Mở minh chứng' }).click();
    await expect(page.locator('main [role="alert"]')).toContainText(/minh chứng/i);
    probe.evidenceMode = 'provider';
    await page.getByRole('button', { name: 'Mở minh chứng' }).click();
    await expect(page.locator('main [role="alert"]')).toContainText(/chưa thể|tạm/i);

    const unavailablePage = await context.newPage();
    const unavailable = await installFinanceFixture(unavailablePage, context, 'payment');
    unavailable.evidenceAvailable = false;
    await unavailablePage.goto(`/backoffice/payments/${ID}`, { waitUntil: 'domcontentloaded' });
    await expect(
      unavailablePage.getByText('Chưa có minh chứng để xem.', { exact: true }),
    ).toBeVisible();
    await expect(unavailablePage.getByRole('button', { name: 'Mở minh chứng' })).toBeDisabled();
    expect(unavailable.evidenceRequests).toBe(0);
    await unavailablePage.close();

    probe.evidenceMode = 'safe';
    await page.getByRole('button', { name: 'Xác nhận thanh toán', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Xác nhận thanh toán' });
    await dialog.getByLabel('Số tiền đã nhận (đồng)').fill('3000000');
    const submit = dialog.getByRole('button', { name: 'Xác nhận thanh toán' });
    await submit.dblclick();
    await expect(page.getByText('Đã xác nhận khoản thanh toán.')).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Xác nhận thanh toán', exact: true }),
    ).toHaveCount(0);
    expect(probe.mutations.filter((path) => path.endsWith('/verify'))).toHaveLength(1);
    expect(probe.paymentStatus).toBe('VERIFIED');

    const rejectPage = await context.newPage();
    const reject = await installFinanceFixture(rejectPage, context, 'payment');
    await rejectPage.goto(`/backoffice/payments/${ID}`, { waitUntil: 'domcontentloaded' });
    await rejectPage.getByRole('button', { name: 'Từ chối minh chứng' }).first().click();
    const rejectDialog = rejectPage.getByRole('dialog', { name: 'Từ chối minh chứng' });
    await rejectDialog.getByLabel('Lý do từ chối').fill('Nội dung chuyển khoản không khớp');
    await rejectDialog.getByRole('button', { name: 'Từ chối minh chứng' }).dblclick();
    await expect(rejectPage.getByText('Đã từ chối minh chứng.')).toBeVisible();
    await expect(rejectPage.getByRole('button', { name: 'Từ chối minh chứng' })).toHaveCount(0);
    expect(reject.mutations.filter((path) => path.endsWith('/reject'))).toHaveLength(1);
    expect(reject.paymentStatus).toBe('REJECTED');
    await rejectPage.close();

    const conflictPage = await context.newPage();
    const conflict = await installFinanceFixture(conflictPage, context, 'payment');
    conflict.conflictNext = true;
    await conflictPage.goto(`/backoffice/payments/${ID}`, { waitUntil: 'domcontentloaded' });
    await conflictPage.getByRole('button', { name: 'Xác nhận thanh toán', exact: true }).click();
    const conflictDialog = conflictPage.getByRole('dialog', { name: 'Xác nhận thanh toán' });
    await conflictDialog.getByLabel('Số tiền đã nhận (đồng)').fill('3000000');
    await conflictDialog.getByRole('button', { name: 'Xác nhận thanh toán' }).click();
    await expect(conflictDialog).toContainText('Dữ liệu vừa được cập nhật');
    await expect(conflictDialog.getByRole('button', { name: 'Xác nhận thanh toán' })).toBeEnabled();
    expect(conflict.paymentStatus).toBe('UNDER_REVIEW');
    await conflictDialog.getByRole('button', { name: 'Xác nhận thanh toán' }).dblclick();
    await expect(conflictPage.getByText('Đã xác nhận khoản thanh toán.')).toBeVisible();
    expect(conflict.mutations.filter((path) => path.endsWith('/verify'))).toHaveLength(2);
    expect(conflict.paymentStatus).toBe('VERIFIED');
    await conflictPage.close();
  });

  test(
    bt('browser:operations-lifecycle', 'refund-processing-lifecycle'),
    async ({ page, context }) => {
      const cash = await installFinanceFixture(page, context, 'refund-cash');
      await page.goto(`/backoffice/refunds/${ID}`, { waitUntil: 'domcontentloaded' });
      await page.getByRole('button', { name: 'Nhận xử lý' }).click();
      const startDialog = page.getByRole('dialog', { name: 'Nhận xử lý' });
      await startDialog.getByLabel('Ghi chú').fill('Nhận xử lý hồ sơ');
      await startDialog.getByRole('button', { name: 'Nhận xử lý' }).dblclick();
      await expect(page.getByText('Đã nhận xử lý yêu cầu hoàn tiền.')).toBeVisible();
      expect(cash.mutations.filter((path) => path.endsWith('/start-processing'))).toHaveLength(1);

      await page.getByRole('button', { name: 'Xác nhận đã hoàn tiền mặt' }).click();
      const cashDialog = page.getByRole('dialog', { name: 'Xác nhận đã hoàn tiền mặt' });
      await cashDialog.getByLabel('Ghi chú hoàn tất').fill('Đã bàn giao đủ tiền mặt');
      await cashDialog.getByRole('button', { name: 'Xác nhận đã hoàn tiền mặt' }).click();
      await expect(page.getByText('Đã xác nhận hoàn tiền mặt.')).toBeVisible();
      expect(cash.refundStatus).toBe('COMPLETED');

      const bankPage = await context.newPage();
      const bank = await installFinanceFixture(bankPage, context, 'refund-bank');
      await bankPage.goto(`/backoffice/refunds/${ID}`, { waitUntil: 'domcontentloaded' });
      await bankPage.getByRole('button', { name: 'Xác nhận đã chuyển khoản' }).click();
      const bankDialog = bankPage.getByRole('dialog', { name: 'Xác nhận đã chuyển khoản' });
      await bankDialog.locator('input[type="file"]').setInputFiles({
        buffer: Buffer.from('proof-fe09'),
        mimeType: 'application/pdf',
        name: 'xac-nhan-fe09.pdf',
      });
      await bankDialog.getByLabel('Ghi chú hoàn tất').fill('Đã chuyển đủ tiền hoàn');
      await bankDialog.getByRole('button', { name: 'Xác nhận đã chuyển khoản' }).dblclick();
      await expect(bankPage.getByText('Đã hoàn tất chuyển khoản và lưu minh chứng.')).toBeVisible();
      expect(
        bank.mutations.filter((path) => path.endsWith('/complete-bank-transfer')),
      ).toHaveLength(1);
      expect(bank.refundEvidence).toBe(true);
      await bankPage.close();
    },
  );
});

async function installFinanceFixture(
  page: Page,
  context: BrowserContext,
  scenario: 'payment' | 'refund-bank' | 'refund-cash',
): Promise<FinanceProbe> {
  const probe: FinanceProbe = {
    conflictNext: false,
    evidenceAvailable: true,
    evidenceMode: 'safe',
    evidenceRequests: 0,
    mutations: [],
    paymentStatus: 'UNDER_REVIEW',
    refundEvidence: false,
    refundMethod: scenario === 'refund-cash' ? 'CASH' : 'BANK_TRANSFER',
    refundStatus: scenario === 'refund-bank' ? 'PROCESSING' : 'REQUESTED',
  };
  await context.route('https://evidence.example/**', (route) =>
    route.fulfill({ body: '<title>Minh chứng FE09</title>', contentType: 'text/html' }),
  );
  await page.route('**/api/v1/auth/refresh', (route) =>
    json(route, {
      data: {
        accessToken: 'finance-fe09',
        user: {
          email: 'employee@rephone.local',
          fullName: 'Nhân viên FE09',
          id: 'staff-fe09',
          phone: '0900000909',
          role: 'EMPLOYEE',
          status: 'ACTIVE',
        },
      },
    }),
  );
  await page.route('**/api/v1/backoffice/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();
    if (method === 'OPTIONS') return route.fulfill({ status: 204 });
    if (path.endsWith('/evidence-url')) {
      probe.evidenceRequests += 1;
      if (probe.evidenceMode === 'provider') return json(route, error('SERVICE_UNAVAILABLE'), 503);
      return json(route, {
        data: {
          expiresAt: '2026-09-02T12:05:00.000Z',
          url:
            probe.evidenceMode === 'unsafe'
              ? 'javascript:alert(1)'
              : `https://evidence.example/safe-${String(probe.evidenceRequests)}`,
        },
      });
    }
    if (method === 'GET' && path.endsWith(`/payments/${ID}`))
      return json(route, { data: payment(probe) });
    if (method === 'GET' && path.endsWith(`/refunds/${ID}`))
      return json(route, { data: refund(probe) });
    if (method !== 'GET') {
      probe.mutations.push(path);
      await delay(80);
      if (probe.conflictNext) {
        probe.conflictNext = false;
        return json(route, error('CONCURRENT_MODIFICATION'), 409);
      }
      if (path.endsWith('/verify')) probe.paymentStatus = 'VERIFIED';
      if (path.endsWith('/reject')) probe.paymentStatus = 'REJECTED';
      if (path.endsWith('/start-processing')) probe.refundStatus = 'PROCESSING';
      if (path.endsWith('/complete-cash')) probe.refundStatus = 'COMPLETED';
      if (path.endsWith('/complete-bank-transfer')) {
        probe.refundStatus = 'COMPLETED';
        probe.refundEvidence = true;
      }
      return json(route, { data: path.includes('/payments/') ? payment(probe) : refund(probe) });
    }
    return json(route, error('RESOURCE_NOT_FOUND'), 404);
  });
  return probe;
}

function payment(probe: FinanceProbe) {
  const verified = probe.paymentStatus === 'VERIFIED';
  const rejected = probe.paymentStatus === 'REJECTED';
  return {
    availableActions:
      verified || rejected
        ? probe.evidenceAvailable
          ? ['VIEW_EVIDENCE']
          : []
        : ['VERIFY', 'REJECT', ...(probe.evidenceAvailable ? ['VIEW_EVIDENCE'] : [])],
    evidenceAvailable: probe.evidenceAvailable,
    order: {
      orderNumber: 'RPH-FE09-FINANCE',
      status: 'PLACED',
      fulfillmentStatus: 'PENDING',
      paymentStatus: verified ? 'DEPOSIT_PAID' : 'DEPOSIT_PENDING',
      grandTotal: '13000000',
      depositRequired: '3000000',
      paidAmount: verified ? '3000000' : '0',
      refundedAmount: '0',
      balanceDue: verified ? '10000000' : '13000000',
      contact: { fullName: 'Khách FE09', email: 'khach@example.com', phone: '0900000000' },
      items: [],
    },
    payment: {
      id: ID,
      orderNumber: 'RPH-FE09-FINANCE',
      purpose: 'DEPOSIT',
      method: 'BANK_TRANSFER',
      status: probe.paymentStatus,
      expectedAmount: '3000000',
      receivedAmount: verified ? '3000000' : null,
      transferContent: 'RPHFE09',
      bankTransferInstructions: null,
      expiresAt: null,
      submittedAt: '2026-09-02T08:00:00.000Z',
      reviewSlaDueAt: null,
      reviewOverdue: false,
      rejectionReason: rejected ? 'Nội dung chuyển khoản không khớp' : null,
    },
    reviewedAt: verified ? '2026-09-02T08:10:00.000Z' : null,
    reviewer: verified ? { id: 'staff-fe09', fullName: 'Nhân viên FE09' } : null,
    reviewNote: null,
    timeline: [],
  };
}

function refund(probe: FinanceProbe) {
  const processing = probe.refundStatus === 'PROCESSING';
  const completed = probe.refundStatus === 'COMPLETED';
  return {
    id: ID,
    orderNumber: 'RPH-FE09-FINANCE',
    amount: '3000000',
    method: probe.refundMethod,
    status: probe.refundStatus,
    requestedByType: 'STAFF',
    requester: { id: 'staff-fe09', fullName: 'Nhân viên FE09', employeeCode: 'NV09' },
    evidenceAvailable: probe.refundEvidence,
    processingAt: processing || completed ? '2026-09-02T08:10:00.000Z' : null,
    completedAt: completed ? '2026-09-02T08:20:00.000Z' : null,
    terminalAt: completed ? '2026-09-02T08:20:00.000Z' : null,
    createdAt: '2026-09-02T08:00:00.000Z',
    reason: 'Hoàn tiền FE09',
    note: null,
    processor: processing || completed ? { id: 'staff-fe09', fullName: 'Nhân viên FE09' } : null,
    terminalActor: null,
    terminalReason: null,
    availableActions: completed
      ? ['VIEW_EVIDENCE']
      : processing
        ? [probe.refundMethod === 'CASH' ? 'COMPLETE_CASH' : 'COMPLETE_BANK_TRANSFER']
        : ['START_PROCESSING'],
    order: {
      id: ID,
      orderNumber: 'RPH-FE09-FINANCE',
      status: 'CANCELLED',
      fulfillmentStatus: 'CANCELLED',
      paymentStatus: 'REFUND_PENDING',
      customerName: 'Khách FE09',
      customerEmail: 'khach@example.com',
      grandTotal: '13000000',
      paidAmount: '3000000',
      refundedAmount: completed ? '3000000' : '0',
      balanceDue: '10000000',
    },
    payment: null,
  };
}

function error(code: string) {
  return {
    error: { code, details: [], message: 'Dịch vụ đang tạm gián đoạn.', requestId: `fe09-${code}` },
  };
}
async function json(route: Route, body: unknown, status = 200) {
  await route.fulfill({ body: JSON.stringify(body), contentType: 'application/json', status });
}
async function delay(ms: number) {
  await new Promise<void>((resolve) => setTimeout(resolve, ms));
}
