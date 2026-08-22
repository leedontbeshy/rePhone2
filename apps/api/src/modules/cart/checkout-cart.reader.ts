import { Inject, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { ApiError } from '../../common/errors/api-error.js';
import { PrismaService } from '../../database/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import type { AuthContext } from '../auth/auth-context.js';
import { GuestCartIdentityService } from '../auth/guest-cart-identity.service.js';

const checkoutCartInclude = {
  items: { orderBy: [{ createdAt: 'asc' as const }, { id: 'asc' as const }] },
  order: { select: { id: true } },
} satisfies Prisma.CartInclude;

export type CheckoutCartRecord = Prisma.CartGetPayload<{ include: typeof checkoutCartInclude }>;

export type CheckoutIdentity =
  { kind: 'CUSTOMER'; customerId: string } | { kind: 'GUEST'; guestTokenHash?: string };

@Injectable()
export class CheckoutCartReader {
  public constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(GuestCartIdentityService)
    private readonly guestIdentity: GuestCartIdentityService,
  ) {}

  public resolveIdentity(auth: AuthContext | undefined, request: Request): CheckoutIdentity {
    if (auth !== undefined) {
      if (auth.role !== 'CUSTOMER') throw new ApiError('FORBIDDEN');
      return { kind: 'CUSTOMER', customerId: auth.userId };
    }
    const token = this.guestIdentity.readToken(request);
    return token === undefined
      ? { kind: 'GUEST' }
      : { kind: 'GUEST', guestTokenHash: this.guestIdentity.digestToken(token) };
  }

  public lockIdentity(
    identity: CheckoutIdentity,
    transaction: Prisma.TransactionClient,
  ): Promise<unknown> {
    const key =
      identity.kind === 'CUSTOMER'
        ? `customer:${identity.customerId}`
        : identity.guestTokenHash === undefined
          ? 'guest:missing'
          : `guest:${identity.guestTokenHash}`;
    return transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
  }

  public findActive(
    identity: CheckoutIdentity,
    client: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<CheckoutCartRecord | null> {
    if (identity.kind === 'CUSTOMER') {
      return client.cart.findFirst({
        where: { customerId: identity.customerId, status: 'ACTIVE' },
        include: checkoutCartInclude,
      });
    }
    if (identity.guestTokenHash === undefined) return Promise.resolve(null);
    return client.cart.findFirst({
      where: { guestTokenHash: identity.guestTokenHash, status: 'ACTIVE' },
      include: checkoutCartInclude,
    });
  }

  public findLatestConverted(
    identity: CheckoutIdentity,
    client: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<CheckoutCartRecord | null> {
    const owner =
      identity.kind === 'CUSTOMER'
        ? { customerId: identity.customerId }
        : identity.guestTokenHash === undefined
          ? null
          : { guestTokenHash: identity.guestTokenHash };
    if (owner === null) return Promise.resolve(null);
    return client.cart.findFirst({
      where: { ...owner, status: 'CONVERTED', order: { isNot: null } },
      include: checkoutCartInclude,
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
    });
  }

  public lockCart(cartId: string, transaction: Prisma.TransactionClient): Promise<unknown> {
    return transaction.$queryRaw`SELECT id FROM carts WHERE id = ${cartId}::uuid FOR UPDATE`;
  }

  public isExpired(cart: CheckoutCartRecord, now: Date): boolean {
    return cart.expiresAt !== null && cart.expiresAt <= now;
  }
}
