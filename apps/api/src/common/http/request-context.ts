import type { Request } from 'express';
import { requestIdFromRequest } from './request-id.js';

export interface RequestContext {
  requestId: string;
  ipAddress: string;
  userAgent?: string;
}

export function requestContext(request: Request): RequestContext {
  const userAgent = request.get('user-agent');
  return {
    requestId: requestIdFromRequest(request) ?? 'unknown',
    ipAddress: request.ip || request.socket.remoteAddress || 'unknown',
    ...(userAgent === undefined ? {} : { userAgent: userAgent.slice(0, 1_000) }),
  };
}
