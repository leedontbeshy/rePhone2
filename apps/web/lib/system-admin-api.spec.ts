import { describe, expect, it } from 'vitest';
import { systemError, SystemAdminError } from './system-admin-api';

describe('systemError', () => {
  it('maps stale settings and duplicate identities to actionable messages', () => {
    expect(
      systemError({ error: { code: 'SETTINGS_VERSION_CONFLICT' } }, 'fallback').message,
    ).toContain('tải lại');
    expect(systemError({ error: { code: 'SETTINGS_VERSION_CONFLICT' } }, 'fallback')).toMatchObject(
      { name: 'SystemAdminError', code: 'SETTINGS_VERSION_CONFLICT' },
    );
    expect(systemError({ error: { code: 'DUPLICATE_RESOURCE' } }, 'fallback').message).toContain(
      'đã tồn tại',
    );
  });

  it('uses the API message when no specialized mapping exists', () => {
    expect(systemError({ error: { message: 'Thông báo an toàn' } }, 'fallback').message).toBe(
      'Thông báo an toàn',
    );
  });

  it('preserves unknown server codes without exposing an untyped error shape', () => {
    const error = systemError({ error: { code: 'SAFE_UNKNOWN', message: 'An toàn' } }, 'fallback');
    expect(error).toBeInstanceOf(SystemAdminError);
    expect(error).toMatchObject({ code: 'SAFE_UNKNOWN', message: 'An toàn' });
  });
});
