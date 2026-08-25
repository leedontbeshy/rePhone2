import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { databaseName } from './slice10-script-support.js';

export const DEMO_SCENARIOS_CONFIRMATION = 'create-demo-scenarios';
export const DEMO_SCENARIO_KEYS = [
  'pickup-ready',
  'shipping-awaiting-proof',
  'shipping-under-review',
  'shipping-in-transit',
  'refund-processing',
  'after-sales-inspecting',
] as const;

export type DemoScenarioKey = (typeof DEMO_SCENARIO_KEYS)[number];

export interface DemoManifest {
  version: 1;
  scenarios: Record<string, unknown>;
}

export interface DemoScenarioProvisioner {
  key: DemoScenarioKey;
  provision(): Promise<void>;
}

const SENSITIVE_KEY_PARTS = [
  'token',
  'password',
  'secret',
  'cookie',
  'credential',
  'hash',
  'digest',
  'identifier',
  'imei',
  'serial',
  'eid',
  'objectpath',
  'bucket',
] as const;

export function assertDemoScenariosGuard(input: {
  connectionString: string;
  nodeEnv: string | undefined;
  confirmation: string | undefined;
}): string {
  const target = databaseName(input.connectionString);
  if (input.nodeEnv === 'production') {
    throw new Error('demo:scenarios is disabled when NODE_ENV=production');
  }
  if (!target.endsWith('_demo') && !target.endsWith('_test')) {
    throw new Error(
      `demo:scenarios only accepts database names ending _demo or _test; received ${target}`,
    );
  }
  if (input.confirmation !== DEMO_SCENARIOS_CONFIRMATION) {
    throw new Error(
      `Set DEMO_SCENARIOS_CONFIRM=${DEMO_SCENARIOS_CONFIRMATION} to create or reuse the guarded scenarios`,
    );
  }
  return target;
}

export async function orchestrateDemoScenarios(
  provisioners: readonly DemoScenarioProvisioner[],
): Promise<DemoScenarioKey[]> {
  const completed: DemoScenarioKey[] = [];
  for (const provisioner of provisioners) {
    await provisioner.provision();
    completed.push(provisioner.key);
  }
  return completed;
}

export async function writeDemoManifestScenario(
  key: DemoScenarioKey,
  scenario: Record<string, unknown>,
  manifestPath = defaultDemoManifestPath(),
): Promise<void> {
  const manifest = await readDemoManifest(manifestPath);
  manifest.scenarios[key] = sanitizeManifestValue(scenario);
  await mkdir(dirname(manifestPath), { recursive: true });
  await writeFile(manifestPath, `${JSON.stringify(sortManifest(manifest), null, 2)}\n`, 'utf8');
}

export async function readDemoManifest(
  manifestPath = defaultDemoManifestPath(),
): Promise<DemoManifest> {
  try {
    const parsed: unknown = JSON.parse(await readFile(manifestPath, 'utf8'));
    if (!isRecord(parsed) || parsed['version'] !== 1 || !isRecord(parsed['scenarios'])) {
      throw new Error('demo manifest shape is invalid');
    }
    const scenarios = sanitizeManifestValue(parsed['scenarios']);
    if (!isRecord(scenarios)) throw new Error('demo manifest scenarios are invalid');
    return { version: 1, scenarios };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return { version: 1, scenarios: {} };
    }
    throw error;
  }
}

export function sanitizeManifestValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeManifestValue);
  if (!isRecord(value)) {
    if (value === null || ['string', 'number', 'boolean'].includes(typeof value)) return value;
    return null;
  }
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !isSensitiveManifestKey(key))
      .map(([key, nested]) => [key, sanitizeManifestValue(nested)]),
  );
}

export function defaultDemoManifestPath(): string {
  const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
  return resolve(workspaceRoot, '.local', 'demo-manifest.json');
}

function sortManifest(manifest: DemoManifest): DemoManifest {
  const scenarios = Object.fromEntries(
    Object.entries(manifest.scenarios).sort(([left], [right]) => left.localeCompare(right)),
  );
  return { version: 1, scenarios };
}

function isSensitiveManifestKey(key: string): boolean {
  const normalized = key.replaceAll(/[^a-z0-9]/gi, '').toLowerCase();
  return SENSITIVE_KEY_PARTS.some((part) => normalized.includes(part));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
