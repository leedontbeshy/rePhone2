import { SetMetadata } from '@nestjs/common';

export const ORDER_RATE_LIMIT_KEY = 'rephone:order-rate-limit';
export type OrderRateLimitKind = 'PREVIEW' | 'CREATE' | 'GUEST_ORDER';

export const OrderRateLimit = (kind: OrderRateLimitKind) => SetMetadata(ORDER_RATE_LIMIT_KEY, kind);
