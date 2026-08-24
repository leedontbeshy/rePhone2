import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../database/prisma.service.js';

type DbClient = PrismaService | Prisma.TransactionClient;

const policySelect = {
  id: true,
  code: true,
  name: true,
  defaultDays: true,
  terms: true,
  status: true,
  archivedAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.WarrantyPolicySelect;

export type WarrantyPolicyReadRecord = Prisma.WarrantyPolicyGetPayload<{
  select: typeof policySelect;
}>;

@Injectable()
export class WarrantyPolicyReader {
  public constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  public findById(id: string, client: DbClient = this.prisma) {
    return client.warrantyPolicy.findUnique({ where: { id }, select: policySelect });
  }

  public findUsableById(id: string, client: DbClient = this.prisma) {
    return client.warrantyPolicy.findFirst({
      where: { id, status: 'ACTIVE', archivedAt: null },
      select: policySelect,
    });
  }
}
