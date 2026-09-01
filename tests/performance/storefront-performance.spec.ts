import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { installDeterministicPublicMedia } from '../browser/support/deterministic-public-media';

const RUN_COUNT = 3;
const VIEWPORT = { width: 390, height: 844 } as const;
const ROUTES = [
  { name: 'model-detail', path: '/products/iphone-14-pro' },
  { name: 'exact-unit-detail', path: '/products/iphone-14-pro/units/IP14P-128-001' },
] as const;
const THRESHOLDS = {
  lcpMs: 2_500,
  cls: 0.1,
  interactionProxyMs: 200,
} as const;
const PROFILE = {
  cpuSlowdownMultiplier: 4,
  latencyMs: 40,
  downloadMbps: 10,
  uploadMbps: 5,
  media: 'fixture-media',
} as const;

interface Sample {
  readonly lcpMs: number;
  readonly cls: number;
  readonly interactionProxyMs: number;
  readonly navigationDurationMs: number;
  readonly requestCount: number;
  readonly transferredBytes: number;
  readonly routeClientBundleBytes: number;
}

interface BrowserMetrics {
  lcpMs: number;
  cls: number;
  interactionPromise?: Promise<number>;
}

declare global {
  interface Window {
    __rephonePerformanceMetrics: BrowserMetrics;
  }
}

test('storefront production performance budgets', async ({ browser }) => {
  expect(RUN_COUNT).toBeGreaterThanOrEqual(3);

  const routeReports: Array<{
    route: (typeof ROUTES)[number]['name'];
    samples: Sample[];
    medians: Sample;
    passed: boolean;
  }> = [];
  for (const route of ROUTES) {
    await measureRoute(browser, route.path, false);

    const samples: Sample[] = [];
    for (let run = 0; run < RUN_COUNT; run += 1) {
      samples.push(await measureRoute(browser, route.path, true));
    }

    const medians = summarize(samples);
    routeReports.push({
      route: route.name,
      samples,
      medians,
      passed:
        medians.lcpMs > 0 &&
        medians.navigationDurationMs > 0 &&
        medians.requestCount > 0 &&
        medians.lcpMs <= THRESHOLDS.lcpMs &&
        medians.cls <= THRESHOLDS.cls &&
        medians.interactionProxyMs <= THRESHOLDS.interactionProxyMs,
    });
  }

  const report = {
    schemaVersion: 1,
    measuredAt: new Date().toISOString(),
    commitSha: currentCommitSha(),
    productionBuild: true,
    runCount: RUN_COUNT,
    viewport: VIEWPORT,
    profile: PROFILE,
    thresholds: THRESHOLDS,
    routes: routeReports,
  };
  await mkdir('.local/release-performance', { recursive: true });
  await writeFile(
    '.local/release-performance/storefront.json',
    `${JSON.stringify(report, null, 2)}\n`,
    'utf8',
  );

  for (const route of routeReports) {
    expect(route.medians.lcpMs, `${route.route} captured LCP`).toBeGreaterThan(0);
    expect(
      route.medians.navigationDurationMs,
      `${route.route} captured navigation`,
    ).toBeGreaterThan(0);
    expect(route.medians.requestCount, `${route.route} captured resources`).toBeGreaterThan(0);
    expect(route.medians.lcpMs, `${route.route} LCP`).toBeLessThanOrEqual(THRESHOLDS.lcpMs);
    expect(route.medians.cls, `${route.route} CLS`).toBeLessThanOrEqual(THRESHOLDS.cls);
    expect(
      route.medians.interactionProxyMs,
      `${route.route} interaction proxy`,
    ).toBeLessThanOrEqual(THRESHOLDS.interactionProxyMs);
  }
});

async function measureRoute(browser: Browser, path: string, collect: boolean): Promise<Sample> {
  const context = await browser.newContext({ viewport: VIEWPORT });
  try {
    await installDeterministicPublicMedia(context);
    await installMetricObservers(context);
    const page = await context.newPage();
    await applyFixedProfile(context, page);
    await page.goto(path, { waitUntil: 'load' });
    await page.evaluate(async () => {
      await document.fonts.ready;
    });
    await page.waitForTimeout(750);
    const interactionProxyMs = await measureMenuInteraction(page);
    if (!collect) return emptySample(interactionProxyMs);
    return await readSample(page, interactionProxyMs);
  } finally {
    await context.close();
  }
}

async function installMetricObservers(context: BrowserContext): Promise<void> {
  await context.addInitScript(() => {
    const metrics = {
      lcpMs: 0,
      cls: 0,
      interactionPromise: undefined as Promise<number> | undefined,
    };
    Object.defineProperty(window, '__rephonePerformanceMetrics', {
      value: metrics,
      configurable: false,
      enumerable: false,
      writable: false,
    });
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) metrics.lcpMs = entry.startTime;
    }).observe({ type: 'largest-contentful-paint', buffered: true });
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const shift = entry as PerformanceEntry & { value: number; hadRecentInput: boolean };
        if (!shift.hadRecentInput) metrics.cls += shift.value;
      }
    }).observe({ type: 'layout-shift', buffered: true });
  });
}

async function applyFixedProfile(context: BrowserContext, page: Page): Promise<void> {
  const session = await context.newCDPSession(page);
  await session.send('Emulation.setCPUThrottlingRate', { rate: PROFILE.cpuSlowdownMultiplier });
  await session.send('Network.enable');
  await session.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: PROFILE.latencyMs,
    downloadThroughput: (PROFILE.downloadMbps * 1_000_000) / 8,
    uploadThroughput: (PROFILE.uploadMbps * 1_000_000) / 8,
  });
}

async function measureMenuInteraction(page: Page): Promise<number> {
  await page.evaluate(() => {
    const metrics = window.__rephonePerformanceMetrics;
    metrics.interactionPromise = new Promise<number>((resolve) => {
      window.addEventListener(
        'click',
        () => {
          const startedAt = performance.now();
          requestAnimationFrame(() => {
            requestAnimationFrame((paintedAt) => {
              resolve(paintedAt - startedAt);
            });
          });
        },
        { capture: true, once: true },
      );
    });
  });
  const trigger = page.getByRole('button', { name: 'Mở danh mục' });
  await trigger.click();
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  return await page.evaluate(async () => {
    const promise = window.__rephonePerformanceMetrics.interactionPromise;
    if (promise === undefined) throw new Error('Interaction measurement was not initialized.');
    return await promise;
  });
}

async function readSample(page: Page, interactionProxyMs: number): Promise<Sample> {
  return await page.evaluate((measuredInteraction) => {
    const metrics = window.__rephonePerformanceMetrics;
    const navigation = performance.getEntriesByType('navigation')[0] as
      PerformanceNavigationTiming | undefined;
    const resources = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
    const sumTransfer = (entries: readonly PerformanceResourceTiming[]) =>
      entries.reduce((total, entry) => total + entry.transferSize, 0);
    const roundMetric = (value: number, digits: number) => {
      const factor = 10 ** digits;
      return Math.round(value * factor) / factor;
    };
    return {
      lcpMs: roundMetric(metrics.lcpMs, 2),
      cls: roundMetric(metrics.cls, 4),
      interactionProxyMs: roundMetric(measuredInteraction, 2),
      navigationDurationMs: roundMetric(navigation?.duration ?? 0, 2),
      requestCount: resources.length,
      transferredBytes: sumTransfer(resources),
      routeClientBundleBytes: sumTransfer(
        resources.filter(({ name }) => name.includes('/_next/static/chunks/')),
      ),
    };
  }, interactionProxyMs);
}

function summarize(samples: readonly Sample[]): Sample {
  if (samples.length < 3) throw new Error('At least three performance samples are required.');
  return {
    lcpMs: median(samples.map(({ lcpMs }) => lcpMs)),
    cls: median(samples.map(({ cls }) => cls)),
    interactionProxyMs: median(samples.map(({ interactionProxyMs }) => interactionProxyMs)),
    navigationDurationMs: median(samples.map(({ navigationDurationMs }) => navigationDurationMs)),
    requestCount: median(samples.map(({ requestCount }) => requestCount)),
    transferredBytes: median(samples.map(({ transferredBytes }) => transferredBytes)),
    routeClientBundleBytes: median(
      samples.map(({ routeClientBundleBytes }) => routeClientBundleBytes),
    ),
  };
}

function median(values: readonly number[]): number {
  const ordered = [...values].sort((left, right) => left - right);
  if (ordered.length === 0) throw new Error('Cannot calculate a median without samples.');
  const middle = Math.floor(ordered.length / 2);
  const right = ordered[middle];
  if (right === undefined) throw new Error('Median sample is missing.');
  if (ordered.length % 2 === 1) return right;
  const left = ordered[middle - 1];
  if (left === undefined) throw new Error('Median sample pair is incomplete.');
  return round((left + right) / 2, 4);
}

function emptySample(interactionProxyMs: number): Sample {
  return {
    lcpMs: 0,
    cls: 0,
    interactionProxyMs,
    navigationDurationMs: 0,
    requestCount: 0,
    transferredBytes: 0,
    routeClientBundleBytes: 0,
  };
}

function currentCommitSha(): string {
  return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
