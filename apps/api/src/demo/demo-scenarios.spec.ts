import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  assertDemoScenariosGuard,
  DEMO_SCENARIOS_CONFIRMATION,
  orchestrateDemoScenarios,
  sanitizeManifestValue,
  writeDemoManifestScenario,
  type DemoScenarioProvisioner,
} from '../../prisma/scripts/demo-scenarios-support.js';

const tempDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirectories.splice(0).map((path) => rm(path, { recursive: true })));
});

describe('demo scenario guard', () => {
  it('accepts only an explicitly confirmed non-production demo/test database', () => {
    expect(
      assertDemoScenariosGuard({
        connectionString: 'postgresql://demo:demo@localhost:5432/rephone_demo',
        nodeEnv: 'development',
        confirmation: DEMO_SCENARIOS_CONFIRMATION,
      }),
    ).toBe('rephone_demo');

    expect(() =>
      assertDemoScenariosGuard({
        connectionString: 'postgresql://demo:demo@localhost:5432/rephone_demo',
        nodeEnv: 'production',
        confirmation: DEMO_SCENARIOS_CONFIRMATION,
      }),
    ).toThrow('NODE_ENV=production');
    expect(() =>
      assertDemoScenariosGuard({
        connectionString: 'postgresql://demo:demo@localhost:5432/rephone',
        nodeEnv: 'development',
        confirmation: DEMO_SCENARIOS_CONFIRMATION,
      }),
    ).toThrow('_demo or _test');
    expect(() =>
      assertDemoScenariosGuard({
        connectionString: 'postgresql://demo:demo@localhost:5432/rephone_test',
        nodeEnv: 'test',
        confirmation: undefined,
      }),
    ).toThrow('DEMO_SCENARIOS_CONFIRM');
  });
});

describe('demo scenario manifest', () => {
  it('recursively removes credentials, tokens and raw identifier metadata', async () => {
    const directory = await mkdtemp(resolve(tmpdir(), 'rephone-demo-manifest-'));
    tempDirectories.push(directory);
    const path = resolve(directory, 'demo-manifest.json');

    await writeDemoManifestScenario(
      'pickup-ready',
      {
        orderId: '01900000-0000-7000-8000-000000000001',
        orderNumber: 'RPH-20260825-23456789',
        guestAccessToken: 'must-not-exist',
        nested: {
          password: 'must-not-exist',
          rawIdentifier: 'must-not-exist',
          evidenceObjectPath: 'must-not-exist',
          publicCode: 'READY',
        },
      },
      path,
    );

    const manifest = JSON.parse(await readFile(path, 'utf8')) as Record<string, unknown>;
    const text = JSON.stringify(manifest);
    expect(text).toContain('RPH-20260825-23456789');
    expect(text).toContain('publicCode');
    expect(text).not.toContain('must-not-exist');
    expect(text).not.toContain('guestAccessToken');
    expect(text).not.toContain('rawIdentifier');
    expect(text).not.toContain('evidenceObjectPath');
  });

  it('preserves only JSON-safe values', () => {
    expect(
      sanitizeManifestValue({ id: 'safe', callback: () => undefined, absent: undefined }),
    ).toEqual({ id: 'safe', callback: null, absent: null });
  });
});

describe('demo scenario orchestration', () => {
  it('runs provisioners sequentially and reports stable scenario ordering', async () => {
    const events: string[] = [];
    const first = vi.fn(async () => {
      events.push('pickup:start');
      await Promise.resolve();
      events.push('pickup:end');
    });
    const second = vi.fn(() => {
      events.push('shipping:start');
      events.push('shipping:end');
      return Promise.resolve();
    });
    const provisioners: DemoScenarioProvisioner[] = [
      { key: 'pickup-ready', provision: first },
      { key: 'shipping-awaiting-proof', provision: second },
    ];

    await expect(orchestrateDemoScenarios(provisioners)).resolves.toEqual([
      'pickup-ready',
      'shipping-awaiting-proof',
    ]);
    expect(events).toEqual(['pickup:start', 'pickup:end', 'shipping:start', 'shipping:end']);
  });

  it('stops before later scenarios when one provisioner fails', async () => {
    const later = vi.fn();
    await expect(
      orchestrateDemoScenarios([
        { key: 'pickup-ready', provision: async () => Promise.reject(new Error('failed')) },
        { key: 'shipping-awaiting-proof', provision: later },
      ]),
    ).rejects.toThrow('failed');
    expect(later).not.toHaveBeenCalled();
  });
});
