import type { IncomingMessage, ServerResponse } from 'node:http';
import { describe, expect, it, vi } from 'vitest';
import { ensureRequestId, isValidRequestId, requestIdFromRequest } from './request-id.js';

describe('isValidRequestId', () => {
  it('accepts UUID and ULID correlation IDs', () => {
    expect(isValidRequestId('0198e4f0-7d16-7c1a-a2bd-39bc2a0f67e1')).toBe(true);
    expect(isValidRequestId('01K33Y8ZZZ9YV3JYH6K9XW4T6Q')).toBe(true);
  });

  it('rejects arbitrary or oversized values', () => {
    expect(isValidRequestId('not-a-request-id')).toBe(false);
    expect(isValidRequestId('x'.repeat(65))).toBe(false);
  });

  it('uses the established request ID as the correlation authority', () => {
    const established = '0198e4f0-7d16-7c1a-a2bd-39bc2a0f67e1';
    const request = {
      id: established,
      headers: { 'x-request-id': '01K33Y8ZZZ9YV3JYH6K9XW4T6Q' },
    } as unknown as IncomingMessage;

    expect(requestIdFromRequest(request)).toBe(established);
  });

  it('replaces invalid input and writes one ID to request and response', () => {
    const setHeader = vi.fn();
    const request = {
      headers: { 'x-request-id': 'not-a-request-id' },
    } as unknown as IncomingMessage;
    const response = {
      getHeader: vi.fn().mockReturnValue(undefined),
      setHeader,
    } as unknown as ServerResponse;

    const requestId = ensureRequestId(request, response);

    expect(isValidRequestId(requestId)).toBe(true);
    expect(request.id).toBe(requestId);
    expect(setHeader).toHaveBeenCalledWith('X-Request-Id', requestId);
  });

  it('keeps a valid response ID when handling an exception before request context exists', () => {
    const responseRequestId = '01K33Y8ZZZ9YV3JYH6K9XW4T6Q';
    const request = {
      headers: { 'x-request-id': '0198e4f0-7d16-7c1a-a2bd-39bc2a0f67e1' },
    } as unknown as IncomingMessage;
    const response = {
      getHeader: vi.fn().mockReturnValue(responseRequestId),
      setHeader: vi.fn(),
    } as unknown as ServerResponse;

    expect(ensureRequestId(request, response)).toBe(responseRequestId);
    expect(request.id).toBe(responseRequestId);
  });
});
