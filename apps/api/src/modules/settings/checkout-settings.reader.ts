import { Inject, Injectable } from '@nestjs/common';
import { ApiError } from '../../common/errors/api-error.js';
import { PrismaService } from '../../database/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';

type DbClient = PrismaService | Prisma.TransactionClient;

export interface CheckoutSettings {
  storeName: string;
  storePhone: string;
  storeAddress: string;
  timezone: string;
  defaultShippingFee: string;
  shippingDepositAmount: string;
  pickupHoldMinutes: number;
  depositProofWindowMinutes: number;
  depositReviewWindowMinutes: number;
  defaultWarrantyDays: number;
  defaultWarrantyTerms: string;
  bankName: string;
  bankAccountNumber: string;
  bankAccountHolder: string;
  bankQrBucket: string | null;
  bankQrObjectPath: string | null;
}

@Injectable()
export class CheckoutSettingsReader {
  public constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  public async read(client: DbClient = this.prisma): Promise<CheckoutSettings> {
    const settings = await client.storeSettings.findUnique({ where: { key: 'STORE' } });
    if (settings === null) throw new ApiError('SERVICE_UNAVAILABLE');
    return {
      storeName: settings.storeName,
      storePhone: settings.storePhone,
      storeAddress: settings.storeAddress,
      timezone: settings.timezone,
      defaultShippingFee: settings.defaultShippingFee.toString(),
      shippingDepositAmount: settings.shippingDepositAmount.toString(),
      pickupHoldMinutes: settings.pickupHoldMinutes,
      depositProofWindowMinutes: settings.depositProofWindowMinutes,
      depositReviewWindowMinutes: settings.depositReviewWindowMinutes,
      defaultWarrantyDays: settings.defaultWarrantyDays,
      defaultWarrantyTerms: settings.defaultWarrantyTerms,
      bankName: settings.bankName,
      bankAccountNumber: settings.bankAccountNumber,
      bankAccountHolder: settings.bankAccountHolder,
      bankQrBucket: settings.bankQrBucket,
      bankQrObjectPath: settings.bankQrObjectPath,
    };
  }
}
