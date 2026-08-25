import type { IncomingMessage, ServerResponse } from 'node:http';
import { validate as validateUuid, v7 as uuidv7 } from 'uuid';

const ULID_PATTERN = /^[0-9A-HJKMNP-TV-Z]{26}$/i;

export const REQUEST_ID_HEADER = 'X-Request-Id';

export function isValidRequestId(value: string): boolean {
  return value.length <= 64 && (validateUuid(value) || ULID_PATTERN.test(value));
}

function establishedRequestId(request: IncomingMessage): string | undefined {
  const established = request.id;
  if (typeof established === 'string' && established.length > 0 && established.length <= 64) {
    return established;
  }
  return undefined;
}

export function requestIdFromRequest(request: IncomingMessage): string | undefined {
  const established = establishedRequestId(request);
  if (established !== undefined) return established;
  const candidate = request.headers['x-request-id'];
  return typeof candidate === 'string' && isValidRequestId(candidate) ? candidate : undefined;
}

export function ensureRequestId(request: IncomingMessage, response: ServerResponse): string {
  const responseRequestId = response.getHeader(REQUEST_ID_HEADER);
  const requestId =
    establishedRequestId(request) ??
    (typeof responseRequestId === 'string' && isValidRequestId(responseRequestId)
      ? responseRequestId
      : (requestIdFromRequest(request) ?? uuidv7()));

  request.id = requestId;
  response.setHeader(REQUEST_ID_HEADER, requestId);
  return requestId;
}

export function generateRequestId(request: IncomingMessage, response: ServerResponse): string {
  return ensureRequestId(request, response);
}
