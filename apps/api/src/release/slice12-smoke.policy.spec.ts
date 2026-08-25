import { describe, expect, it } from 'vitest';
import {
  accessTokenSessionId,
  assertSlice12FullSmokeSafety,
  parseSlice12SmokeMode,
  SLICE12_SMOKE_CONFIRMATION,
} from './slice12-smoke.policy.js';

const identities = {
  adminEmail: 'slice12-smoke-admin@rephone.local',
  employeeEmail: 'slice12-smoke-employee@rephone.local',
  customerEmail: 'slice12-smoke-customer@rephone.local',
};

describe('Slice 12 smoke safety policy', () => {
  it('extracts only the exact session identifier used for cleanup', () => {
    const payload = Buffer.from(JSON.stringify({ sessionId: 'session-smoke-1' })).toString(
      'base64url',
    );
    expect(accessTokenSessionId(`header.${payload}.signature`)).toBe('session-smoke-1');
    expect(() => accessTokenSessionId('not-a-jwt')).toThrow('invalid shape');
    const missingSession = Buffer.from(JSON.stringify({ role: 'ADMIN' })).toString('base64url');
    expect(() => accessTokenSessionId(`header.${missingSession}.signature`)).toThrow(
      'missing its session identifier',
    );
  });

  it('defaults to a read-only preflight mode', () => {
    expect(parseSlice12SmokeMode(undefined)).toBe('preflight');
    expect(parseSlice12SmokeMode(' PREflight ')).toBe('preflight');
    expect(() => {
      assertSlice12FullSmokeSafety({ mode: 'preflight' });
    }).not.toThrow();
  });

  it('accepts only the two documented modes', () => {
    expect(parseSlice12SmokeMode('smoke')).toBe('smoke');
    expect(() => parseSlice12SmokeMode('full')).toThrow(
      'SLICE12_SMOKE_MODE must be preflight or smoke',
    );
  });

  it('requires the exact full-smoke confirmation', () => {
    expect(() => {
      assertSlice12FullSmokeSafety({
        mode: 'smoke',
        confirmation: 'yes',
        nodeEnvironment: 'test',
        identities,
      });
    }).toThrow(`SLICE12_SMOKE_CONFIRM=${SLICE12_SMOKE_CONFIRMATION}`);
  });

  it('forbids full smoke in a production process', () => {
    expect(() => {
      assertSlice12FullSmokeSafety({
        mode: 'smoke',
        confirmation: SLICE12_SMOKE_CONFIRMATION,
        nodeEnvironment: ' production ',
        identities,
      });
    }).toThrow('NODE_ENV=production');
  });

  it('requires distinct identities carrying the smoke marker', () => {
    expect(() => {
      assertSlice12FullSmokeSafety({
        mode: 'smoke',
        confirmation: SLICE12_SMOKE_CONFIRMATION,
        nodeEnvironment: 'test',
      });
    }).toThrow('requires dedicated ADMIN, EMPLOYEE and CUSTOMER identities');

    expect(() => {
      assertSlice12FullSmokeSafety({
        mode: 'smoke',
        confirmation: SLICE12_SMOKE_CONFIRMATION,
        nodeEnvironment: 'test',
        identities: { ...identities, employeeEmail: identities.adminEmail.toUpperCase() },
      });
    }).toThrow('three distinct accounts');

    expect(() => {
      assertSlice12FullSmokeSafety({
        mode: 'smoke',
        confirmation: SLICE12_SMOKE_CONFIRMATION,
        nodeEnvironment: 'test',
        identities: { ...identities, customerEmail: 'customer@rephone.local' },
      });
    }).toThrow('EMPLOYEE and CUSTOMER identity emails must contain the marker "smoke"');
  });

  it('accepts a seeded admin with dedicated smoke employee and customer identities', () => {
    expect(() => {
      assertSlice12FullSmokeSafety({
        mode: 'smoke',
        confirmation: SLICE12_SMOKE_CONFIRMATION,
        nodeEnvironment: 'test',
        identities: { ...identities, adminEmail: 'admin@rephone.local' },
      });
    }).not.toThrow();
  });
});
