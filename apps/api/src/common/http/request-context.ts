import type { Request } from 'express';

export interface RequestContext {
  requestId: string;
  ipAddress: string;
  userAgent?: string;
}

export function requestContext(request: Request): RequestContext {
  const userAgent = request.get('user-agent');
  return {
    requestId:
      typeof request.id === 'string'
        ? request.id
        : typeof request.id === 'number'
          ? request.id.toString()
          : (request.get('x-request-id') ?? 'unknown'),
    ipAddress: request.ip || request.socket.remoteAddress || 'unknown',
    ...(userAgent === undefined ? {} : { userAgent: userAgent.slice(0, 1_000) }),
  };
}
