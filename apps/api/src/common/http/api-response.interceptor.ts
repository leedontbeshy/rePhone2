import { CallHandler, ExecutionContext, Injectable, type NestInterceptor } from '@nestjs/common';
import type { Request, Response } from 'express';
import { map, type Observable } from 'rxjs';

export function serializeApiResponse<T>(data: T): { data: T } {
  return { data };
}

@Injectable()
export class ApiResponseInterceptor implements NestInterceptor {
  public intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();

    if (request.path.startsWith('/health/') || response.statusCode === 204) {
      return next.handle();
    }

    return next.handle().pipe(map((data: unknown) => serializeApiResponse(data)));
  }
}
