import { describe, expect, it, vi } from 'vitest';
import { serializeApiResponse } from '../../common/http/api-response.interceptor.js';
import { SystemHealthController } from './health.controller.js';
import type { SystemHealthService } from './system-health.service.js';

describe('SystemHealthController', () => {
  it('delegates the safe detailed projection to the health service', async () => {
    const inspect = vi.fn().mockResolvedValue({ state: 'healthy' });
    const controller = new SystemHealthController({ inspect } as unknown as SystemHealthService);

    const detail = await controller.inspect();

    expect(detail).toEqual({ state: 'healthy' });
    expect(serializeApiResponse(detail)).toEqual({ data: { state: 'healthy' } });
    expect(inspect).toHaveBeenCalledOnce();
  });
});
