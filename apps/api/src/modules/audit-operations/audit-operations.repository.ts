import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import type { BackofficeAuditLogListQueryDto } from './audit-operations.dto.js';

const actorSelect = {
  id: true,
  fullName: true,
  role: true,
  employeeCode: true,
} as const;

export const auditOperationsInclude = {
  actorUser: { select: actorSelect },
} satisfies Prisma.AuditLogInclude;

export type AuditOperationsRecord = Prisma.AuditLogGetPayload<{
  include: typeof auditOperationsInclude;
}>;

@Injectable()
export class AuditOperationsRepository {
  public constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  public async list(query: BackofficeAuditLogListQueryDto): Promise<{
    items: AuditOperationsRecord[];
    totalItems: number;
  }> {
    const where = buildAuditWhere(query);
    const orderBy = [
      { createdAt: query.sortOrder },
      { id: query.sortOrder },
    ] satisfies Prisma.AuditLogOrderByWithRelationInput[];
    const [items, totalItems] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        include: auditOperationsInclude,
        orderBy,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    return { items, totalItems };
  }

  public findById(id: string): Promise<AuditOperationsRecord | null> {
    return this.prisma.auditLog.findUnique({
      where: { id },
      include: auditOperationsInclude,
    });
  }
}

export function buildAuditWhere(query: BackofficeAuditLogListQueryDto): Prisma.AuditLogWhereInput {
  return {
    ...(query.actorUserId === undefined ? {} : { actorUserId: query.actorUserId }),
    ...(query.actorType === undefined ? {} : { actorType: query.actorType }),
    ...(query.action === undefined ? {} : { action: actionFilter(query.action) }),
    ...(query.resourceType === undefined ? {} : { resourceType: query.resourceType }),
    ...(query.resourceId === undefined ? {} : { resourceId: query.resourceId }),
    ...(query.requestId === undefined ? {} : { requestId: query.requestId }),
    ...(query.createdFrom === undefined && query.createdTo === undefined
      ? {}
      : {
          createdAt: {
            ...(query.createdFrom === undefined ? {} : { gte: new Date(query.createdFrom) }),
            ...(query.createdTo === undefined ? {} : { lte: new Date(query.createdTo) }),
          },
        }),
  };
}

function actionFilter(action: string): string | Prisma.StringFilter<'AuditLog'> {
  return action.endsWith('.*') ? { startsWith: action.slice(0, -1) } : action;
}
