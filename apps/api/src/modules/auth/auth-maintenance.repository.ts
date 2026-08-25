import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';

export type AuthMaintenanceRecordType = 'SESSION' | 'TOKEN';

export interface ExpiredAuthRecordCandidate {
  recordType: AuthMaintenanceRecordType;
  id: string;
  terminalAt: Date;
}

@Injectable()
export class AuthMaintenanceRepository {
  public constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  public findCleanupCandidates(
    cutoff: Date,
    batchSize: number,
  ): Promise<ExpiredAuthRecordCandidate[]> {
    return this.prisma.$queryRaw<ExpiredAuthRecordCandidate[]>`
      SELECT
        candidates.record_type AS "recordType",
        candidates.id,
        candidates.terminal_at AS "terminalAt"
      FROM (
        SELECT
          'SESSION'::text AS record_type,
          id,
          CASE
            WHEN revoked_at IS NOT NULL AND revoked_at < expires_at THEN revoked_at
            ELSE expires_at
          END AS terminal_at
        FROM auth_sessions
        WHERE expires_at <= ${cutoff} OR revoked_at <= ${cutoff}

        UNION ALL

        SELECT
          'TOKEN'::text AS record_type,
          id,
          CASE
            WHEN consumed_at IS NOT NULL AND consumed_at < expires_at THEN consumed_at
            ELSE expires_at
          END AS terminal_at
        FROM auth_tokens
        WHERE expires_at <= ${cutoff} OR consumed_at <= ${cutoff}
      ) AS candidates
      WHERE candidates.terminal_at <= ${cutoff}
      ORDER BY candidates.terminal_at ASC, candidates.record_type ASC, candidates.id ASC
      LIMIT ${batchSize}
    `;
  }

  public async deleteCandidate(
    candidate: Pick<ExpiredAuthRecordCandidate, 'id' | 'recordType'>,
    cutoff: Date,
  ): Promise<boolean> {
    const count =
      candidate.recordType === 'SESSION'
        ? await this.prisma.$executeRaw`
            DELETE FROM auth_sessions
            WHERE id = ${candidate.id}::uuid
              AND (expires_at <= ${cutoff} OR revoked_at <= ${cutoff})
          `
        : await this.prisma.$executeRaw`
            DELETE FROM auth_tokens
            WHERE id = ${candidate.id}::uuid
              AND (expires_at <= ${cutoff} OR consumed_at <= ${cutoff})
          `;
    return count === 1;
  }
}
