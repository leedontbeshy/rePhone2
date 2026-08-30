import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { SystemHealthSnapshot } from '@/lib/system-admin-api';
import { healthProbePresentation, healthSummary } from './health-presenter';
import { HealthStatusPanel } from './health-view';

describe('system health presentation', () => {
  it('uses only the three approved safe status labels', () => {
    expect(healthProbePresentation('live', 'healthy').label).toBe('Đang hoạt động');
    expect(healthProbePresentation('ready', 'healthy').label).toBe('Sẵn sàng');
    expect(healthProbePresentation('ready', 'degraded').label).toBe('Gián đoạn');
    expect(healthProbePresentation('live', 'unavailable').label).toBe('Gián đoạn');
  });

  it('renders an operational summary without request or infrastructure details', () => {
    const markup = renderToStaticMarkup(<HealthStatusPanel snapshot={healthySnapshot()} />);

    expect(markup).toContain('Hệ thống đang hoạt động ổn định');
    expect(markup).toContain('Đang hoạt động');
    expect(markup).toContain('Sẵn sàng');
    expect(markup).toContain('Lần kiểm tra gần nhất');
    expect(markup.toLowerCase()).not.toContain('database');
    expect(markup.toLowerCase()).not.toContain('migration');
    expect(markup.toLowerCase()).not.toContain('secret');
  });

  it('keeps a degraded readiness result distinct in the view model', () => {
    const snapshot = healthySnapshot({ ready: { state: 'degraded' } });
    const markup = renderToStaticMarkup(<HealthStatusPanel snapshot={snapshot} />);

    expect(healthSummary(snapshot).tone).toBe('warning');
    expect(markup).toContain('Hệ thống cần được kiểm tra');
    expect(markup).toContain('Gián đoạn');
    expect(markup).not.toContain('503');
  });
});

function healthySnapshot(overrides: Partial<SystemHealthSnapshot> = {}): SystemHealthSnapshot {
  return {
    checkedAt: '2026-08-30T04:30:00.000Z',
    live: { state: 'healthy' },
    ready: { state: 'healthy' },
    ...overrides,
  };
}
