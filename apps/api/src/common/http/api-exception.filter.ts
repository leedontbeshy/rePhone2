import {
  ArgumentsHost,
  Catch,
  HttpException,
  HttpStatus,
  type ExceptionFilter,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { ApiError, type ApiErrorCode, type ApiErrorDetail } from '../errors/api-error.js';
import { API_ERROR_REGISTRY } from '../errors/api-error-registry.js';

export interface ErrorEnvelope {
  error: {
    code: ApiErrorCode;
    message: string;
    details: ApiErrorDetail[];
    requestId: string;
  };
}

const HTTP_STATUS_ERROR_CODES: Readonly<Partial<Record<number, ApiErrorCode>>> = {
  [HttpStatus.NOT_FOUND]: 'RESOURCE_NOT_FOUND',
  [HttpStatus.UNAUTHORIZED]: 'AUTH_REQUIRED',
  [HttpStatus.FORBIDDEN]: 'FORBIDDEN',
  [HttpStatus.TOO_MANY_REQUESTS]: 'RATE_LIMITED',
  [HttpStatus.SERVICE_UNAVAILABLE]: 'SERVICE_UNAVAILABLE',
};

export interface SerializedApiError {
  status: number;
  body: ErrorEnvelope;
}

function resolveRequestId(request: Request, response: Response): string {
  if (typeof request.id === 'string') {
    return request.id;
  }
  if (typeof request.id === 'number') {
    return request.id.toString();
  }
  return response.getHeader('X-Request-Id')?.toString() ?? 'unknown';
}

function isMalformedJson(exception: unknown): boolean {
  return (
    exception instanceof SyntaxError &&
    'type' in exception &&
    (exception as SyntaxError & { type?: string }).type === 'entity.parse.failed'
  );
}

export function serializeApiError(exception: unknown, requestId: string): SerializedApiError {
  let code: ApiErrorCode = 'INTERNAL_ERROR';
  let details: ApiErrorDetail[] = [];
  let message: string | undefined;

  if (exception instanceof ApiError) {
    code = exception.code;
    details = exception.details;
    message = exception.message;
  } else if (isMalformedJson(exception)) {
    code = 'MALFORMED_JSON';
  } else if (exception instanceof HttpException) {
    code = HTTP_STATUS_ERROR_CODES[exception.getStatus()] ?? 'INTERNAL_ERROR';
  }

  const definition = API_ERROR_REGISTRY[code];
  return {
    status: definition.status,
    body: {
      error: {
        code,
        message: message || definition.message,
        details,
        requestId,
      },
    },
  };
}

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  public catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const request = context.getRequest<Request>();
    const response = context.getResponse<Response>();
    const requestId = resolveRequestId(request, response);

    if (request.path.startsWith('/health/')) {
      const status =
        exception instanceof HttpException ? exception.getStatus() : HttpStatus.SERVICE_UNAVAILABLE;
      response.status(status).json({ status: 'error' });
      return;
    }

    const { status, body } = serializeApiError(exception, requestId);
    const code = body.error.code;

    const log = request.log;
    if (status >= 500) {
      log.error({ err: exception, event: 'http.request.failed', requestId, errorCode: code });
    } else {
      log.warn({ event: 'http.request.rejected', requestId, errorCode: code, statusCode: status });
    }

    response.status(status).json(body);
  }
}
