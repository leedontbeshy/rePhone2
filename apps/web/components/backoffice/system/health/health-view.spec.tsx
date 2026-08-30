import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { SystemHealthSnapshot } from '@/lib/system-admin-api';
import {
  healthFreshness,
  healthGuidance,
  healthProbePresentation,
  healthSummary,
} from './health-presenter';
import { HealthStatusPanel } from './health-view';

describe('system health presentation', () => {
  it('uses localized safe status labels for every dependency state', () => {
    expect(healthProbePresentation('api', { state: 'healthy', reason: 'ok' }).label).toBe(
      'Ổn định',
    );
    expect(
      healthProbePresentation('database', { state: 'degraded', reason: 'incomplete_migration' })
        .label,
    ).toBe('Cần chú ý');
    expect(
      healthProbePresentation('mail', { state: 'not_configured', reason: 'not_configured' }).label,
    ).toBe('Chưa cấu hình');
    expect(
      healthProbePresentation('storage', { state: 'unavailable', reason: 'timeout' }).label,
    ).toBe('Gián đoạn');
  });

  it('renders an operational summary without request or infrastructure details', () => {
    const markup = renderToStaticMarkup(
      <HealthStatusPanel
        observedAt={new Date('2026-08-30T04:34:00.000Z')}
        snapshot={healthySnapshot()}
      />,
    );

    expect(markup).toContain('Hệ thống đang hoạt động ổn định');
    expect(markup).toContain('Cơ sở dữ liệu');
    expect(markup).toContain('Kho tệp');
    expect(markup).toContain('Gửi email');
    expect(markup).toContain('4 phút trước');
    expect(markup).toContain('Không cần thao tác');
    expect(markup).toContain('href="/backoffice/audit-logs"');
    expect(markup.toLowerCase()).not.toContain('secret');
  });

  it('keeps a degraded readiness result distinct in the view model', () => {
    const snapshot = healthySnapshot({
      state: 'degraded',
      database: {
        state: 'degraded',
        reason: 'incomplete_migration',
        latencyMs: 12,
        appliedMigrationCount: 12,
        incompleteMigrationCount: 1,
      },
    });
    const markup = renderToStaticMarkup(
      <HealthStatusPanel observedAt={new Date('2026-08-30T04:50:00.000Z')} snapshot={snapshot} />,
    );

    expect(healthSummary(snapshot).tone).toBe('warning');
    expect(markup).toContain('Hệ thống đang hoạt động hạn chế');
    expect(markup).toContain('Cần chú ý');
    expect(markup).toContain('Theo dõi dịch vụ phụ thuộc');
    expect(markup).toContain('Nên kiểm tra lại trước khi xử lý sự cố.');
    expect(markup).not.toContain('503');
  });

  it('derives freshness and action guidance only from the approved snapshot fields', () => {
    expect(
      healthFreshness('2026-08-30T04:30:00.000Z', new Date('2026-08-30T06:30:00.000Z')),
    ).toMatchObject({ label: '2 giờ trước', tone: 'warning' });
    expect(healthGuidance(healthySnapshot()).title).toBe('Không cần thao tác');
    expect(healthGuidance(healthySnapshot({ state: 'unavailable' })).title).toBe(
      'Cần kiểm tra ngay',
    );
  });
});

function healthySnapshot(overrides: Partial<SystemHealthSnapshot> = {}): SystemHealthSnapshot {
  return {
    state: 'healthy',
    checkedAt: '2026-08-30T04:30:00.000Z',
    durationMs: 22,
    api: { state: 'healthy', reason: 'ok', latencyMs: 0, uptimeSeconds: 3600, version: 'dev' },
    database: {
      state: 'healthy',
      reason: 'ok',
      latencyMs: 12,
      appliedMigrationCount: 12,
      incompleteMigrationCount: 0,
    },
    storage: { state: 'healthy', reason: 'ok', latencyMs: 20 },
    mail: { state: 'healthy', reason: 'ok', latencyMs: 8 },
    ...overrides,
  };
}
