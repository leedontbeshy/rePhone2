import type { Request } from 'express';
import { describe, expect, it } from 'vitest';
import { requestContext } from './request-context.js';

describe('requestContext', () => {
  it('uses the established request ID and bounds the user agent', () => {
    const request = {
      id: '0198e4f0-7d16-7c1a-a2bd-39bc2a0f67e1',
      headers: {},
      get: (name: string) => (name === 'user-agent' ? 'a'.repeat(1_100) : undefined),
      ip: '127.0.0.1',
      socket: {},
    } as unknown as Request;

    expect(requestContext(request)).toEqual({
      requestId: '0198e4f0-7d16-7c1a-a2bd-39bc2a0f67e1',
      ipAddress: '127.0.0.1',
      userAgent: 'a'.repeat(1_000),
    });
  });

  it('does not propagate an invalid caller ID into audit context', () => {
    const request = {
      headers: { 'x-request-id': 'attacker-controlled-value' },
      get: (name: string) => (name === 'x-request-id' ? 'attacker-controlled-value' : undefined),
      ip: '127.0.0.1',
      socket: {},
    } as unknown as Request;

    expect(requestContext(request).requestId).toBe('unknown');
  });

  it('falls back to the socket address without inventing a user agent', () => {
    const request = {
      headers: {},
      get: () => undefined,
      ip: '',
      socket: { remoteAddress: '10.0.0.8' },
    } as unknown as Request;

    expect(requestContext(request)).toEqual({
      requestId: 'unknown',
      ipAddress: '10.0.0.8',
    });
  });

  it('uses an explicit unknown IP when Express and the socket have none', () => {
    const request = {
      headers: {},
      get: () => undefined,
      ip: '',
      socket: {},
    } as unknown as Request;

    expect(requestContext(request).ipAddress).toBe('unknown');
  });
});
