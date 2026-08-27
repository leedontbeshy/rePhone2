import { PrismaPg } from '@prisma/adapter-pg';
import { argon2id, hash } from 'argon2';
import { createHash } from 'node:crypto';
import { seedDatabase } from '../../prisma/seed-data.js';
import { PrismaClient } from '../../src/generated/prisma/client.js';
import { setTestEnvironment } from '../support/test-environment.js';
import { BROWSER_INVITATION_ACCOUNT, BROWSER_RESET_ACCOUNT } from './auth-fixtures.js';

setTestEnvironment();

const connectionString = process.env.DATABASE_URL;
if (connectionString === undefined || !new URL(connectionString).pathname.endsWith('_test')) {
  throw new Error('Refusing to seed browser tests outside a _test database');
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
try {
  await seedDatabase(prisma);
  await seedBrowserAuthFixtures(prisma);
} finally {
  await prisma.$disconnect();
}

async function seedBrowserAuthFixtures(client: PrismaClient): Promise<void> {
  const passwordHash = await hash(BROWSER_RESET_ACCOUNT.oldPassword, {
    type: argon2id,
    memoryCost: Number(process.env.ARGON2_MEMORY_KIB ?? '8192'),
    timeCost: Number(process.env.ARGON2_TIME_COST ?? '1'),
    parallelism: Number(process.env.ARGON2_PARALLELISM ?? '1'),
  });

  const resetUser = await client.user.upsert({
    where: { normalizedEmail: BROWSER_RESET_ACCOUNT.email },
    update: {
      passwordHash,
      passwordChangedAt: null,
      role: 'CUSTOMER',
      status: 'ACTIVE',
    },
    create: {
      email: BROWSER_RESET_ACCOUNT.email,
      normalizedEmail: BROWSER_RESET_ACCOUNT.email,
      passwordHash,
      role: 'CUSTOMER',
      status: 'ACTIVE',
      fullName: 'Khách đặt lại mật khẩu Browser',
      phone: '0900000001',
    },
  });

  const invitationUser = await client.user.upsert({
    where: { normalizedEmail: BROWSER_INVITATION_ACCOUNT.email },
    update: {
      passwordHash: null,
      passwordChangedAt: null,
      emailVerifiedAt: null,
      role: 'EMPLOYEE',
      status: 'PENDING_VERIFICATION',
    },
    create: {
      email: BROWSER_INVITATION_ACCOUNT.email,
      normalizedEmail: BROWSER_INVITATION_ACCOUNT.email,
      role: 'EMPLOYEE',
      status: 'PENDING_VERIFICATION',
      fullName: 'Nhân viên lời mời Browser',
      employeeCode: 'EMP-BROWSER-AUTH',
    },
  });

  await client.$transaction([
    client.authToken.deleteMany({
      where: { userId: { in: [resetUser.id, invitationUser.id] } },
    }),
    client.authToken.create({
      data: {
        userId: resetUser.id,
        purpose: 'RESET_PASSWORD',
        tokenHash: digest(BROWSER_RESET_ACCOUNT.token),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    }),
    client.authToken.create({
      data: {
        userId: invitationUser.id,
        purpose: 'EMPLOYEE_INVITATION',
        tokenHash: digest(BROWSER_INVITATION_ACCOUNT.token),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    }),
  ]);
}

function digest(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}
