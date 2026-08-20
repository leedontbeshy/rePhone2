import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../../generated/prisma/client.js';
import { PrismaService } from '../../../database/prisma.service.js';

type DbClient = PrismaService | Prisma.TransactionClient;

export interface LockedAuthSession {
  id: string;
  userId: string;
  refreshTokenHash: string;
  tokenFamilyId: string;
  userAgent: string | null;
  ipAddress: string | null;
  lastUsedAt: Date | null;
  expiresAt: Date;
  revokedAt: Date | null;
  createdAt: Date;
}

@Injectable()
export class AuthSessionsRepository {
  public constructor(private readonly prisma: PrismaService) {}

  public create(
    data: {
      userId: string;
      refreshTokenHash: string;
      tokenFamilyId: string;
      userAgent?: string;
      ipAddress?: string;
      expiresAt: Date;
    },
    client: DbClient = this.prisma,
  ) {
    return client.authSession.create({ data });
  }

  public findAccessSession(id: string) {
    return this.prisma.authSession.findUnique({ where: { id }, include: { user: true } });
  }

  public async lockByRefreshTokenHash(
    refreshTokenHash: string,
    client: Prisma.TransactionClient,
  ): Promise<LockedAuthSession | null> {
    const sessions = await client.$queryRaw<LockedAuthSession[]>`
      SELECT
        id,
        user_id AS "userId",
        refresh_token_hash AS "refreshTokenHash",
        token_family_id AS "tokenFamilyId",
        user_agent AS "userAgent",
        ip_address AS "ipAddress",
        last_used_at AS "lastUsedAt",
        expires_at AS "expiresAt",
        revoked_at AS "revokedAt",
        created_at AS "createdAt"
      FROM auth_sessions
      WHERE refresh_token_hash = ${refreshTokenHash}
      FOR UPDATE
    `;
    return sessions[0] ?? null;
  }

  public revoke(id: string, revokedAt: Date, client: DbClient = this.prisma) {
    return client.authSession.update({
      where: { id },
      data: { revokedAt, lastUsedAt: revokedAt },
    });
  }

  public revokeFamily(tokenFamilyId: string, revokedAt: Date, client: DbClient = this.prisma) {
    return client.authSession.updateMany({
      where: { tokenFamilyId, revokedAt: null },
      data: { revokedAt, lastUsedAt: revokedAt },
    });
  }

  public revokeAllForUser(userId: string, revokedAt: Date, client: DbClient = this.prisma) {
    return client.authSession.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt, lastUsedAt: revokedAt },
    });
  }
}
