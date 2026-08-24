import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../database/prisma.service.js';

type DbClient = PrismaService | Prisma.TransactionClient;

export interface ActiveWarrantyPolicyReferences {
  products: number;
  variants: number;
}

@Injectable()
export class WarrantyPolicyCatalogReferenceGateway {
  public constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  public async countActiveReferences(
    policyId: string,
    client: DbClient = this.prisma,
  ): Promise<ActiveWarrantyPolicyReferences> {
    const products = await client.product.count({
      where: { warrantyPolicyId: policyId, status: 'ACTIVE' },
    });
    const variants = await client.productVariant.count({
      where: { warrantyPolicyId: policyId, status: 'ACTIVE' },
    });
    return { products, variants };
  }

  public async hasActiveReferences(policyId: string, client: DbClient = this.prisma) {
    const references = await this.countActiveReferences(policyId, client);
    return references.products > 0 || references.variants > 0;
  }
}
