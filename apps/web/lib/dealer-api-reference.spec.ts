import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEALER_API_ENDPOINTS, dealerEndpointCurl } from './dealer-api-reference';

const repositoryRoot = resolve(import.meta.dirname, '../../..');
interface OpenApiOperation {
  operationId?: string;
  responses: Record<string, unknown>;
  security?: Record<string, unknown>[];
}
const document = JSON.parse(
  readFileSync(resolve(repositoryRoot, 'apps/api/openapi/openapi.json'), 'utf8'),
) as { paths: Record<string, Record<string, OpenApiOperation>> };

describe('customer dealer API reference', () => {
  it('documents every external commerce operation exactly once, excluding administration APIs', () => {
    const operations = Object.entries(document.paths).flatMap(([path, item]) =>
      Object.entries(item)
        .filter(([, operation]) =>
          /^(DealerController|DealerAfterSalesController)_/.test(operation.operationId ?? ''),
        )
        .map(([method]) => `${method.toUpperCase()} ${path.replace('/api/v1', '')}`),
    );
    const references = DEALER_API_ENDPOINTS.map(({ method, path }) => `${method} ${path}`);

    expect(operations).toHaveLength(16);
    expect(new Set(references).size).toBe(references.length);
    expect(new Set(DEALER_API_ENDPOINTS.map(({ id }) => id)).size).toBe(references.length);
    expect([...references].sort()).toEqual(operations.sort());
  });

  it('keeps required scopes aligned with the commerce controller permissions', () => {
    const permissions = [
      'apps/api/src/modules/dealers/dealer.controller.ts',
      'apps/api/src/modules/dealers/dealer-after-sales.controller.ts',
    ].flatMap((file) => {
      const source = readFileSync(resolve(repositoryRoot, file), 'utf8');
      return [
        ...source.matchAll(
          /@(Get|Post)\('([^']+)'\)[\s\S]*?@DealerPermission\(\{ scope: '([^']+)'/g,
        ),
      ].map((match) => {
        const [, method, path, scope] = match;
        if (method === undefined || path === undefined || scope === undefined) {
          throw new Error('Incomplete dealer controller permission');
        }
        return {
          method: method.toUpperCase(),
          path: `/dealer/${path.replaceAll(/:([A-Za-z]+)/g, '{$1}')}`,
          scope,
        };
      });
    });

    expect(permissions).toHaveLength(16);
    for (const endpoint of DEALER_API_ENDPOINTS) {
      expect(permissions).toContainEqual({
        method: endpoint.method,
        path: endpoint.path,
        scope: endpoint.scope,
      });
    }
  });

  it('uses documented HTTP success codes and the API-key security scheme', () => {
    for (const endpoint of DEALER_API_ENDPOINTS) {
      const operation = document.paths[`/api/v1${endpoint.path}`]?.[endpoint.method.toLowerCase()];
      expect(operation, endpoint.id).toBeDefined();
      expect(operation?.responses).toHaveProperty(String(endpoint.successStatus));
      expect(operation?.security).toContainEqual({ dealerApiKey: [] });
      expect(endpoint.responseExample).toHaveProperty('data');
    }
  });

  it('explains all path placeholders and uses the API version prefix only from the configured base', () => {
    for (const endpoint of DEALER_API_ENDPOINTS) {
      expect(endpoint.path).not.toContain('/api/v1');
      const placeholders = [...endpoint.path.matchAll(/\{([^}]+)\}/g)].map((match) => match[1]);
      const pathFields = (endpoint.fields ?? [])
        .filter(({ location, required }) => location === 'path' && required)
        .map(({ name }) => name);
      expect([...pathFields].sort()).toEqual(placeholders.sort());
      expect(dealerEndpointCurl(endpoint)).toContain(
        `--url "$REPHONE_API_BASE_URL${endpoint.path}"`,
      );
      expect(dealerEndpointCurl(endpoint)).toContain('--globoff');
    }
  });

  it('authenticates every example with the server-side API key without browser or session headers', () => {
    for (const endpoint of DEALER_API_ENDPOINTS) {
      const curl = dealerEndpointCurl(endpoint);
      expect(curl).toContain('--header "X-Dealer-Api-Key: $REPHONE_DEALER_KEY"');
      expect(curl).not.toMatch(/Authorization:|Cookie:|Origin:|Sec-Fetch-Site:/i);
    }
  });

  it('requires idempotency only for creating an order or an after-sales request', () => {
    const idempotent = DEALER_API_ENDPOINTS.filter((endpoint) => endpoint.idempotency);
    expect(idempotent.map(({ method, path }) => `${method} ${path}`).sort()).toEqual([
      'POST /dealer/after-sales',
      'POST /dealer/orders',
    ]);
    for (const endpoint of DEALER_API_ENDPOINTS) {
      expect(dealerEndpointCurl(endpoint).includes('Idempotency-Key:')).toBe(
        endpoint.idempotency === true,
      );
    }
  });

  it('builds multipart uploads with one file and lets curl supply its own multipart boundary', () => {
    const uploads = DEALER_API_ENDPOINTS.filter((endpoint) =>
      endpoint.fields?.some(({ location }) => location === 'file'),
    );
    expect(uploads.map(({ path }) => path).sort()).toEqual([
      '/dealer/after-sales/{id}/attachments',
      '/dealer/payment-requests/{id}/proofs',
    ]);
    for (const endpoint of uploads) {
      const curl = dealerEndpointCurl(endpoint);
      expect(curl).toContain('--form "file=@/path/to/evidence.png;type=image/png"');
      expect(curl).not.toContain('Content-Type:');
      expect(curl).not.toContain('--data-raw');
    }
  });

  it('supplies JSON for every JSON POST example and does not send bodies for GET', () => {
    for (const endpoint of DEALER_API_ENDPOINTS) {
      const curl = dealerEndpointCurl(endpoint);
      if (endpoint.requestBody !== undefined) {
        expect(endpoint.method).toBe('POST');
        expect(curl).toContain('--header "Content-Type: application/json"');
        expect(curl).toContain('--data-raw');
      }
      if (endpoint.method === 'GET') {
        expect(curl).not.toMatch(/--data|--form|Content-Type:/);
      }
    }
  });

  it('quotes JSON as a shell literal, including apostrophes and shell metacharacters', () => {
    const endpoint = DEALER_API_ENDPOINTS.find(({ id }) => id === 'orders-cancel');
    if (endpoint === undefined) throw new Error('Cancellation endpoint missing');
    const curl = dealerEndpointCurl({
      ...endpoint,
      requestBody: { reason: "L'écran $(whoami) `command`" },
    });
    expect(curl).toContain('L' + "'\\''" + 'écran $(whoami) `command`');
    expect(curl).toContain("--data-raw '{");
  });
});
