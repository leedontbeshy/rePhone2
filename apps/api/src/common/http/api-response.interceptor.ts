import { CallHandler, ExecutionContext, Injectable, type NestInterceptor } from '@nestjs/common';
import type { Request, Response } from 'express';
import { map, type Observable } from 'rxjs';

export type SerializedApiResponse<T> =
  { data: T } | { data: unknown[]; meta: { pagination: ApiPagination } };

export function serializeApiResponse<T>(data: T): SerializedApiResponse<T> {
  if (data instanceof PaginatedApiResult) {
    return {
      data: data.items,
      meta: { pagination: data.pagination },
    };
  }
  return { data };
}

export interface ApiPagination {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export class PaginatedApiResult<T> {
  public constructor(
    public readonly items: T[],
    public readonly pagination: ApiPagination,
  ) {}
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
