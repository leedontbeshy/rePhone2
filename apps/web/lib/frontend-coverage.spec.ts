import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  FRONTEND_OPERATION_COVERAGE,
  FRONTEND_PHASE_STATUS,
  FRONTEND_REQUIRED_STATES,
  FRONTEND_ROUTE_COVERAGE,
} from './frontend-coverage';

const repositoryRoot = resolve(import.meta.dirname, '../../..');
const allowedOperationStatuses = {
  DONE: ['DONE'],
  'IN PROGRESS': ['NOT STARTED', 'IN PROGRESS'],
  'NOT STARTED': ['NOT STARTED'],
} as const;

describe('FE-0 frontend coverage contract', () => {
  it('assigns every OpenAPI operation to exactly one route, phase and automated test', () => {
    const openApiOperations = readOpenApiOperations();
    const openApiOperationIds = openApiOperations.map(({ operationId }) => operationId);
    const manifestOperationIds = FRONTEND_OPERATION_COVERAGE.map(([operationId]) => operationId);
    const manifestOperations = FRONTEND_OPERATION_COVERAGE.map(
      ([operationId, method, apiPath]) => ({
        apiPath,
        method,
        operationId,
      }),
    );

    expect(openApiOperationIds).toHaveLength(160);
    expect(new Set(openApiOperationIds).size).toBe(160);
    expect(manifestOperationIds).toHaveLength(160);
    expect(new Set(manifestOperationIds).size).toBe(160);
    expect([...manifestOperationIds].sort()).toEqual([...openApiOperationIds].sort());
    expect(sortOperations(manifestOperations)).toEqual(sortOperations(openApiOperations));

    for (const [
      operationId,
      method,
      apiPath,
      accessMode,
      targetRoute,
      actionState,
      phase,
      automatedTest,
      status,
    ] of FRONTEND_OPERATION_COVERAGE) {
      expect(operationId.length).toBeGreaterThan(0);
      expect(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']).toContain(method);
      expect(apiPath.startsWith('/')).toBe(true);
      expect(accessMode.length).toBeGreaterThan(0);
      expect(targetRoute.length).toBeGreaterThan(0);
      expect(actionState.length).toBeGreaterThan(0);
      expect(phase).toMatch(/^FE-[1-8]$/);
      expect(automatedTest.startsWith('browser:')).toBe(true);
      const owningPhaseStatus = FRONTEND_PHASE_STATUS[phase];
      expect(allowedOperationStatuses[owningPhaseStatus]).toContain(status);
    }

    const phaseStatuses: ReadonlyArray<readonly [string, string]> =
      Object.entries(FRONTEND_PHASE_STATUS);
    const inProgressPhases = phaseStatuses
      .filter(([, status]) => status === 'IN PROGRESS')
      .map(([phase]) => phase);
    expect(inProgressPhases).toEqual([]);
    expect(readPlanPhaseStatuses()).toEqual(FRONTEND_PHASE_STATUS);
  });

  it('keeps the executable manifest aligned with the approved plan-fe.md ledger', () => {
    expect(readPlanOperationCoverage()).toEqual(
      FRONTEND_OPERATION_COVERAGE.map(
        ([
          operationId,
          method,
          apiPath,
          accessMode,
          targetRoute,
          actionState,
          phase,
          automatedTest,
          status,
        ]) => ({
          operationId,
          method,
          apiPath,
          accessMode,
          targetRoute,
          actionState,
          phase,
          automatedTest,
          status,
        }),
      ),
    );
  });

  it('assigns every current and approved route exactly once', () => {
    const currentRoutes = readCurrentNextRoutes();
    const manifestRoutes = FRONTEND_ROUTE_COVERAGE.map(([route]) => route);
    const existingRoutes = FRONTEND_ROUTE_COVERAGE.filter(([, kind]) => kind === 'EXISTING').map(
      ([route]) => route,
    );
    const plannedRoutes = FRONTEND_ROUTE_COVERAGE.filter(([, kind]) => kind === 'PLANNED').map(
      ([route]) => route,
    );

    expect(currentRoutes).toHaveLength(existingRoutes.length);
    expect(new Set(manifestRoutes).size).toBe(55);
    expect(existingRoutes.length + plannedRoutes.length).toBe(55);
    expect([...existingRoutes].sort()).toEqual([...currentRoutes].sort());
    expect(plannedRoutes.filter((route) => currentRoutes.includes(route))).toEqual([]);
    expect(plannedRoutes).not.toContain('/backoffice/catalog/products/[id]/variants/[variantId]');
    expect(readPlanRouteCoverage()).toEqual(
      FRONTEND_ROUTE_COVERAGE.map(([route, kind, phase]) => ({ route, kind, phase })),
    );
  });

  it('locks the shared state inventory used by every later phase', () => {
    expect(FRONTEND_REQUIRED_STATES).toEqual([
      'loading',
      'empty',
      'error',
      'success',
      'warning',
      'permission',
      'unavailable',
      'stale',
      'conflict',
      'disabled',
      'pending',
      'provider-error',
      'upload-progress',
    ]);
  });
});

function readOpenApiOperations(): Array<{
  apiPath: string;
  method: string;
  operationId: string;
}> {
  const document = JSON.parse(
    readFileSync(join(repositoryRoot, 'apps/api/openapi/openapi.json'), 'utf8'),
  ) as { paths: Record<string, Record<string, { operationId?: string }>> };
  const methods = new Set(['get', 'post', 'put', 'patch', 'delete']);

  return Object.entries(document.paths).flatMap(([apiPath, pathItem]) =>
    Object.entries(pathItem)
      .filter(([method]) => methods.has(method))
      .flatMap(([method, operation]) =>
        operation.operationId === undefined
          ? []
          : [{ apiPath, method: method.toUpperCase(), operationId: operation.operationId }],
      ),
  );
}

function sortOperations<T extends { apiPath: string; method: string; operationId: string }>(
  operations: readonly T[],
) {
  return [...operations].sort((left, right) =>
    `${left.operationId}|${left.method}|${left.apiPath}`.localeCompare(
      `${right.operationId}|${right.method}|${right.apiPath}`,
    ),
  );
}

function readPlanOperationCoverage(): Array<{
  operationId: string;
  method: string;
  apiPath: string;
  accessMode: string;
  targetRoute: string;
  actionState: string;
  phase: string;
  automatedTest: string;
  status: string;
}> {
  return readFileSync(join(repositoryRoot, 'plan-fe.md'), 'utf8')
    .split(/\r?\n/)
    .filter(
      (line) => /^\|\s*\d+\s*\|/.test(line) && /\|\s*`(?:GET|POST|PUT|PATCH|DELETE)\s/.test(line),
    )
    .map((line) => {
      const cells = line.split('|').map((cell) => cell.trim());
      const contract = stripCode(cells[3] ?? '');
      const separator = contract.indexOf(' ');
      return {
        operationId: stripCode(cells[2] ?? ''),
        method: contract.slice(0, separator),
        apiPath: contract.slice(separator + 1),
        accessMode: cells[4] ?? '',
        targetRoute: stripCode(cells[5] ?? ''),
        actionState: stripCode(cells[6] ?? ''),
        phase: cells[7] ?? '',
        automatedTest: stripCode(cells[8] ?? ''),
        status: cells[9] ?? '',
      };
    });
}

function readPlanRouteCoverage(): Array<{ route: string; kind: string; phase: string }> {
  const plan = readFileSync(join(repositoryRoot, 'plan-fe.md'), 'utf8');
  const section = plan
    .split(/^### 5\.1\. Route ownership ledger[^\n]*$/m)[1]
    ?.split('## 6. Dependency graph')[0];
  if (section === undefined) throw new Error('Route ownership ledger is missing from plan-fe.md');

  return section
    .split(/\r?\n/)
    .filter((line) => /^\|\s*\d+\s*\|/.test(line))
    .map((line) => {
      const cells = line.split('|').map((cell) => cell.trim());
      return {
        route: stripCode(cells[2] ?? ''),
        kind: cells[3] === 'Hiện có' ? 'EXISTING' : 'PLANNED',
        phase: cells[4] ?? '',
      };
    });
}

function readPlanPhaseStatuses(): Record<string, string> {
  const plan = readFileSync(join(repositoryRoot, 'plan-fe.md'), 'utf8');
  return Object.fromEntries(
    [
      ...plan.matchAll(
        /^### (FE-\d) —[^\n]*\n\n[\s\S]*?^\| Trạng thái\s+\| \*\*(NOT STARTED|IN PROGRESS|DONE)\*\*/gm,
      ),
    ].map(([, phase, status]) => [phase, status]),
  ) as Record<string, string>;
}

function readCurrentNextRoutes(): string[] {
  const appRoot = join(repositoryRoot, 'apps/web/app');
  return listPageFiles(appRoot)
    .map((file) => {
      const segments = relative(appRoot, file)
        .split(sep)
        .slice(0, -1)
        .filter((segment) => !/^\(.+\)$/.test(segment));
      return `/${segments.join('/')}`;
    })
    .sort();
}

function listPageFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = join(directory, entry.name);
    if (entry.isDirectory()) return listPageFiles(target);
    return entry.name === 'page.tsx' ? [target] : [];
  });
}

function stripCode(value: string): string {
  return value.replaceAll('`', '');
}
