import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  FRONTEND_OPERATION_COVERAGE,
  FRONTEND_REQUIRED_STATES,
  FRONTEND_ROUTE_COVERAGE,
} from './frontend-coverage';

const repositoryRoot = resolve(import.meta.dirname, '../../..');

describe('frontend coverage contract', () => {
  it('assigns every OpenAPI operation to exactly one route and automated test', () => {
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

    expect(openApiOperationIds.filter((id) => !/^(Dealer|Affiliate)/.test(id))).toHaveLength(165);
    expect(openApiOperationIds.filter((id) => id.startsWith('Dealer'))).toHaveLength(67);
    expect(openApiOperationIds.filter((id) => id.startsWith('Affiliate'))).toHaveLength(23);
    expect(new Set(openApiOperationIds).size).toBe(openApiOperationIds.length);
    expect(manifestOperationIds).toHaveLength(openApiOperationIds.length);
    expect(new Set(manifestOperationIds).size).toBe(manifestOperationIds.length);
    expect([...manifestOperationIds].sort()).toEqual([...openApiOperationIds].sort());
    expect(sortOperations(manifestOperations)).toEqual(sortOperations(openApiOperations));

    for (const [
      operationId,
      method,
      apiPath,
      accessMode,
      targetRoute,
      actionState,
      browserOwner,
    ] of FRONTEND_OPERATION_COVERAGE) {
      expect(operationId.length).toBeGreaterThan(0);
      expect(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']).toContain(method);
      expect(apiPath.startsWith('/')).toBe(true);
      expect(accessMode.length).toBeGreaterThan(0);
      expect(targetRoute.length).toBeGreaterThan(0);
      expect(actionState.length).toBeGreaterThan(0);
      expect(browserOwner.startsWith('browser:')).toBe(true);
    }
  });

  it('assigns every application route exactly once', () => {
    const currentRoutes = readCurrentNextRoutes();
    const manifestRoutes = FRONTEND_ROUTE_COVERAGE.map(([route]) => route);
    expect(new Set(manifestRoutes).size).toBe(manifestRoutes.length);
    expect([...manifestRoutes].sort()).toEqual(currentRoutes);
  });

  it('locks the shared state inventory shared by the application', () => {
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
