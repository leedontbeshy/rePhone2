import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '../../../generated/prisma/client.js';
import { PrismaService } from '../../../database/prisma.service.js';

type DbClient = PrismaService | Prisma.TransactionClient;

@Injectable()
export class UsersRepository {
  public constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  public findByNormalizedEmail(normalizedEmail: string, client: DbClient = this.prisma) {
    return client.user.findUnique({ where: { normalizedEmail } });
  }

  public findById(id: string, client: DbClient = this.prisma) {
    return client.user.findUnique({ where: { id } });
  }

  public createCustomer(
    data: {
      email: string;
      normalizedEmail: string;
      passwordHash: string;
      fullName: string;
      phone?: string;
    },
    client: DbClient = this.prisma,
  ) {
    return client.user.create({
      data: {
        ...data,
        role: 'CUSTOMER',
        status: 'ACTIVE',
      },
    });
  }

  public createPendingEmployee(
    data: {
      email: string;
      normalizedEmail: string;
      fullName: string;
      phone?: string;
      employeeCode: string;
      hiredAt?: Date;
    },
    client: DbClient = this.prisma,
  ) {
    return client.user.create({
      data: {
        ...data,
        role: 'EMPLOYEE',
        status: 'PENDING_VERIFICATION',
      },
    });
  }
}
