import type { INestApplication } from '@nestjs/common';
import type { OpenAPIObject } from '@nestjs/swagger';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { setTestEnvironment } from '../../../test/support/test-environment.js';
import { DealerRuntime } from '../../modules/dealers/dealer-runtime.service.js';
import { createOpenApiDocument } from '../../openapi/openapi.js';

describe('Dealer OpenAPI without public simulation', () => {
  let app: INestApplication;
  let document: OpenAPIObject;

  beforeAll(async () => {
    setTestEnvironment();
    vi.stubEnv('DEALER_ENABLED', 'true');
    vi.stubEnv('DEALER_ENVIRONMENT', 'TEST');
    vi.stubEnv('DEALER_WORKER_ENABLED', 'false');
    vi.stubEnv('AFFILIATE_ENABLED', 'false');
    vi.stubEnv('AFFILIATE_ENVIRONMENT', 'TEST');
    const { createApplication } = await import('../../application.js');
    // Contract discovery needs providers and controllers, not app.init(), database writes or workers.
    app = await createApplication({ enableSwagger: false });
    document = createOpenApiDocument(app);
  }, 60_000);

  afterAll(async () => {
    await app.close();
    vi.unstubAllEnvs();
  });

  it('keeps commerce available in TEST while omitting every simulator operation and schema', () => {
    expect(app.get(DealerRuntime)).toMatchObject({ enabled: true, mode: 'TEST' });
    expect(document.paths['/api/v1/dealer/catalog']?.get).toBeDefined();
    expect(document.paths['/api/v1/dealer/orders']?.post).toBeDefined();
    expect(document.paths['/api/v1/backoffice/dealers/receipts']?.post).toBeDefined();
    expect(Object.keys(document.paths).some((path) => path.includes('/sandbox'))).toBe(false);
    expect(document.components?.schemas).not.toHaveProperty('DealerSimulationDto');
    expect(JSON.stringify(document)).not.toContain('DealerSandboxController');
  });
});
