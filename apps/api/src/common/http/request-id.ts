import type { IncomingMessage, ServerResponse } from 'node:http';
import { validate as validateUuid, v7 as uuidv7 } from 'uuid';

const ULID_PATTERN = /^[0-9A-HJKMNP-TV-Z]{26}$/i;

export const REQUEST_ID_HEADER = 'X-Request-Id';

export function isValidRequestId(value: string): boolean {
  return value.length <= 64 && (validateUuid(value) || ULID_PATTERN.test(value));
}

export function generateRequestId(request: IncomingMessage, response: ServerResponse): string {
  const candidate = request.headers['x-request-id'];
  const requestId =
    typeof candidate === 'string' && isValidRequestId(candidate) ? candidate : uuidv7();
  response.setHeader(REQUEST_ID_HEADER, requestId);
  return requestId;
}
