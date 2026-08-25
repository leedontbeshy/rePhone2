import { Inject, Injectable } from '@nestjs/common';
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
  public constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

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

  public findByRefreshTokenHash(refreshTokenHash: string) {
    return this.prisma.authSession.findUnique({ where: { refreshTokenHash } });
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

  public revoke(id: string, client: DbClient = this.prisma) {
    return client.$executeRaw`
      UPDATE auth_sessions
      SET revoked_at = GREATEST(clock_timestamp(), created_at),
          last_used_at = GREATEST(clock_timestamp(), created_at)
      WHERE id = ${id}
    `;
  }

  public revokeFamily(tokenFamilyId: string, client: DbClient = this.prisma) {
    return client.$executeRaw`
      UPDATE auth_sessions
      SET revoked_at = GREATEST(clock_timestamp(), created_at),
          last_used_at = GREATEST(clock_timestamp(), created_at)
      WHERE token_family_id = ${tokenFamilyId}
        AND revoked_at IS NULL
    `;
  }

  public revokeAllForUser(userId: string, client: DbClient = this.prisma) {
    return client.$executeRaw`
      UPDATE auth_sessions
      SET revoked_at = GREATEST(clock_timestamp(), created_at),
          last_used_at = GREATEST(clock_timestamp(), created_at)
      WHERE user_id = ${userId}
        AND revoked_at IS NULL
    `;
  }
}
