import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../../generated/prisma/client.js';
import type { AuthTokenPurpose } from '../../../generated/prisma/enums.js';
import { PrismaService } from '../../../database/prisma.service.js';

type DbClient = PrismaService | Prisma.TransactionClient;

export interface LockedAuthToken {
  id: string;
  userId: string;
  purpose: AuthTokenPurpose;
  tokenHash: string;
  expiresAt: Date;
  consumedAt: Date | null;
  createdAt: Date;
}

@Injectable()
export class AuthTokensRepository {
  public constructor(private readonly prisma: PrismaService) {}

  public create(
    data: { userId: string; purpose: AuthTokenPurpose; tokenHash: string; expiresAt: Date },
    client: DbClient = this.prisma,
  ) {
    return client.authToken.create({ data });
  }

  public invalidateActive(
    userId: string,
    purpose: AuthTokenPurpose,
    consumedAt: Date,
    client: DbClient = this.prisma,
  ) {
    return client.authToken.updateMany({
      where: { userId, purpose, consumedAt: null },
      data: { consumedAt },
    });
  }

  public async lockByHash(
    tokenHash: string,
    client: Prisma.TransactionClient,
  ): Promise<LockedAuthToken | null> {
    const tokens = await client.$queryRaw<LockedAuthToken[]>`
      SELECT
        id,
        user_id AS "userId",
        purpose,
        token_hash AS "tokenHash",
        expires_at AS "expiresAt",
        consumed_at AS "consumedAt",
        created_at AS "createdAt"
      FROM auth_tokens
      WHERE token_hash = ${tokenHash}
      FOR UPDATE
    `;
    return tokens[0] ?? null;
  }

  public consume(id: string, consumedAt: Date, client: DbClient = this.prisma) {
    return client.authToken.update({ where: { id }, data: { consumedAt } });
  }
}
