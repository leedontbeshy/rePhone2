import type { Page, Route } from '@playwright/test';

export const PENDING_TASKS_PATH = '/api/v1/backoffice/overview/pending-tasks';

/** Include the sidebar's aggregate in fixtures that use mock staff sessions. */
export async function fulfillPendingTasks(route: Route): Promise<boolean> {
  if (new URL(route.request().url()).pathname !== PENDING_TASKS_PATH) return false;
  const origin = route.request().headers()['origin'];
  await route.fulfill({
    status: route.request().method() === 'OPTIONS' ? 204 : 200,
    contentType: 'application/json',
    headers: {
      ...(origin ? { 'Access-Control-Allow-Origin': origin } : {}),
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Allow-Headers': 'authorization, content-type, x-rephone-csrf',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
    },
    body:
      route.request().method() === 'OPTIONS'
        ? ''
        : JSON.stringify({
            data: {
              generatedAt: '2026-10-01T00:00:00.000Z',
              counts: {
                orders: 0,
                payments: 0,
                refunds: 0,
                afterSales: 0,
                inventory: 0,
                dealers: 0,
                affiliates: 0,
              },
            },
          }),
  });
  return true;
}

export async function installPendingTasksFixture(page: Page): Promise<void> {
  await page.route(`**${PENDING_TASKS_PATH}`, async (route) => {
    await fulfillPendingTasks(route);
  });
}
