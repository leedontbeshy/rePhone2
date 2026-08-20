import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../database/prisma.service.js';

type DbClient = PrismaService | Prisma.TransactionClient;

@Injectable()
export class AccountsRepository {
  public constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  public findAccount(userId: string, client: DbClient = this.prisma) {
    return client.user.findUnique({ where: { id: userId } });
  }

  public updateAccount(
    userId: string,
    data: { fullName?: string; phone?: string | null },
    client: DbClient = this.prisma,
  ) {
    return client.user.update({ where: { id: userId }, data });
  }

  public listAddresses(userId: string, client: DbClient = this.prisma) {
    return client.customerAddress.findMany({
      where: { userId, archivedAt: null },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });
  }

  public findAddress(userId: string, addressId: string, client: DbClient = this.prisma) {
    return client.customerAddress.findFirst({
      where: { id: addressId, userId, archivedAt: null },
    });
  }

  public createAddress(
    userId: string,
    data: {
      label?: string;
      receiverName: string;
      phone: string;
      addressLine: string;
      ward: string;
      district: string;
      province: string;
      postalCode?: string;
      isDefault: boolean;
    },
    client: DbClient = this.prisma,
  ) {
    return client.customerAddress.create({ data: { ...data, userId } });
  }

  public updateAddress(
    addressId: string,
    data: Prisma.CustomerAddressUpdateInput,
    client: DbClient = this.prisma,
  ) {
    return client.customerAddress.update({ where: { id: addressId }, data });
  }

  public clearDefaultAddress(userId: string, client: DbClient = this.prisma) {
    return client.customerAddress.updateMany({
      where: { userId, archivedAt: null, isDefault: true },
      data: { isDefault: false },
    });
  }

  public async lockUser(userId: string, client: Prisma.TransactionClient): Promise<boolean> {
    const rows = await client.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM users WHERE id = ${userId} FOR UPDATE
    `;
    return rows.length === 1;
  }
}
