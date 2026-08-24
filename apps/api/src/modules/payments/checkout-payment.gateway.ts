import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';

export interface CreateDepositPaymentInput {
  orderId: string;
  expectedAmount: string;
  transferContent: string;
  bankName: string;
  bankAccountNumber: string;
  bankAccountHolder: string;
  bankQrBucket: string | null;
  bankQrObjectPath: string | null;
  reviewWindowMinutes: number;
  expiresAt: Date;
}

@Injectable()
export class CheckoutPaymentGateway {
  public createDeposit(input: CreateDepositPaymentInput, transaction: Prisma.TransactionClient) {
    return transaction.payment.create({
      data: {
        orderId: input.orderId,
        purpose: 'DEPOSIT',
        method: 'BANK_TRANSFER',
        expectedAmount: input.expectedAmount,
        status: 'AWAITING_PROOF',
        transferContent: input.transferContent,
        bankNameSnapshot: input.bankName,
        bankAccountNumberSnapshot: input.bankAccountNumber,
        bankAccountHolderSnapshot: input.bankAccountHolder,
        bankQrBucketSnapshot: input.bankQrBucket,
        bankQrObjectPathSnapshot: input.bankQrObjectPath,
        reviewWindowMinutesSnapshot: input.reviewWindowMinutes,
        expiresAt: input.expiresAt,
      },
    });
  }

}
