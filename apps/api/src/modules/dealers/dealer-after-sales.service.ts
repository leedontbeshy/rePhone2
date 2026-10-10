import { Inject, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { ApiError } from '../../common/errors/api-error.js';
import { STORAGE_PROVIDER, type StorageProvider } from '../../common/providers/storage-provider.js';
import { PrismaService } from '../../database/prisma.service.js';
import { SerializableTransactionRunner } from '../../database/serializable-transaction.runner.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { AuditWriter } from '../audit/audit-writer.service.js';
import type { AuditWriteActorContext } from '../audit/audit.types.js';
import { AfterSalesRepository } from '../after-sales/after-sales.repository.js';
import { generateAfterSalesRequestNumber } from '../after-sales/after-sales-code.js';
import { isWarrantyValid } from '../after-sales/after-sales-policy.js';
import {
  parseAfterSalesAttachments,
  projectAfterSalesDetail,
} from '../after-sales/after-sales.projector.js';
import type { CreateAfterSalesRequestDto } from '../after-sales/after-sales.dto.js';
import { CheckoutSettingsReader } from '../settings/checkout-settings.reader.js';
import { PrivateEvidenceValidator } from '../storage/private-evidence.validator.js';
import { assertDealerContext, lockDealerOrder } from './dealer-order.service.js';
import type { DealerContext } from './dealer-context.js';
import { DealerRuntime, dealerHash, canonicalDealerJson } from './dealer-runtime.service.js';
import type { DealerAssessmentDto } from './dealer.dto.js';

@Injectable()
export class DealerAfterSalesService {
  private readonly logger = new Logger(DealerAfterSalesService.name);
  public constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(SerializableTransactionRunner)
    private readonly transactions: SerializableTransactionRunner,
    @Inject(AfterSalesRepository) private readonly cases: AfterSalesRepository,
    @Inject(CheckoutSettingsReader) private readonly settings: CheckoutSettingsReader,
    @Inject(AuditWriter) private readonly audit: AuditWriter,
    @Inject(DealerRuntime) private readonly runtime: DealerRuntime,
    @Inject(PrivateEvidenceValidator) private readonly evidence: PrivateEvidenceValidator,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
  ) {}

  public async list(dealerId?: string) {
    const rows = await this.prisma.afterSalesRequest.findMany({
      where: {
        orderItem: {
          order: { channel: 'DEALER', ...(dealerId === undefined ? {} : { dealerId }) },
        },
      },
      select: { id: true },
      orderBy: { requestedAt: 'desc' },
      take: 100,
    });
    return Promise.all(rows.map(({ id }) => this.detail(id, dealerId)));
  }

  public async detail(id: string, dealerId?: string) {
    await this.requireCase(id, dealerId);
    const row = await this.cases.findById(id);
    if (row === null) throw new ApiError('RESOURCE_NOT_FOUND');
    const assessment = await this.prisma.afterSalesRequest.findUniqueOrThrow({
      where: { id },
      select: { dealerAssessment: true, dealerWarrantyExtensionDays: true },
    });
    return Object.assign(projectAfterSalesDetail(row, new Date()), {
      id: row.id,
      assessment: assessment.dealerAssessment,
      warrantyExtensionDays: assessment.dealerWarrantyExtensionDays,
    });
  }

  public async create(
    input: CreateAfterSalesRequestDto,
    actor: AuditWriteActorContext,
    context?: DealerContext,
    key?: string,
  ) {
    if (key === undefined || !/^[\x21-\x7e]{16,128}$/.test(key))
      throw new ApiError('VALIDATION_FAILED', 'Cần Idempotency-Key cho yêu cầu hậu mãi.');
    const keyHash = dealerHash(key);
    const payloadHash = dealerHash(canonicalDealerJson(input));
    const id = await this.transactions.run('dealer.after_sales.create', async (tx) => {
      const item = await tx.orderItem.findUnique({
        where: { id: input.orderItemId },
        include: { warranty: true },
      });
      if (item === null) throw new ApiError('RESOURCE_NOT_FOUND');
      const order = await lockDealerOrder(tx, item.orderId, context?.dealerId);
      if (context !== undefined) await assertDealerContext(tx, context, 'AFTER_SALES');
      const prior = await tx.dealerIdempotencyRecord.findUnique({
        where: {
          dealerId_operation_keyHash: {
            dealerId: order.dealerId,
            operation: 'CREATE_AFTER_SALES',
            keyHash,
          },
        },
      });
      if (prior !== null) {
        if (prior.payloadHash !== payloadHash) throw new ApiError('CONCURRENT_MODIFICATION');
        return prior.resourceId;
      }
      if (order.status !== 'COMPLETED' || order.completedAt === null)
        throw new ApiError('INVALID_STATE_TRANSITION');
      if ((await this.cases.findOpenForOrderItem(item.id, tx)) !== null)
        throw new ApiError('AFTER_SALES_REQUEST_ALREADY_OPEN');
      const now = new Date();
      if (
        input.type === 'WARRANTY' &&
        (item.warranty === null || !isWarrantyValid(item.warranty, now))
      )
        throw new ApiError('WARRANTY_NOT_ACTIVE');
      const settings = await this.settings.read(tx);
      const row = await this.cases.create(
        {
          requestNumber: generateAfterSalesRequestNumber(now, settings.timezone),
          orderItemId: item.id,
          customerId: null,
          warrantyId: input.type === 'WARRANTY' ? (item.warranty?.id ?? null) : null,
          type: input.type,
          issueDescription: input.issueDescription,
          requestedResolution: input.requestedResolution ?? null,
          attachments: [],
        },
        tx,
      );
      await this.audit.write(tx, actor, {
        action: 'dealer.after_sales.created',
        resourceType: 'AfterSalesRequest',
        resourceId: row.id,
        metadata: { dealerId: order.dealerId, backupIntake: context === undefined },
      });
      await tx.dealerIdempotencyRecord.create({
        data: {
          dealerId: order.dealerId,
          operation: 'CREATE_AFTER_SALES',
          keyHash,
          payloadHash,
          resourceId: row.id,
        },
      });
      return row.id;
    });
    return this.detail(id, context?.dealerId);
  }

  public async cancel(
    id: string,
    reason: string,
    context: DealerContext,
    actor: AuditWriteActorContext,
  ) {
    const root = await this.requireCase(id, context.dealerId);
    await this.transactions.run('dealer.after_sales.cancel', async (tx) => {
      await lockDealerOrder(tx, root.orderItem.orderId, context.dealerId);
      await assertDealerContext(tx, context, 'AFTER_SALES');
      const changed = await tx.afterSalesRequest.updateMany({
        where: { id, status: 'REQUESTED' },
        data: { status: 'CANCELLED', cancelledAt: new Date(), cancelReason: reason },
      });
      if (changed.count !== 1) throw new ApiError('INVALID_STATE_TRANSITION');
      await this.audit.write(tx, actor, {
        action: 'dealer.after_sales.cancelled',
        resourceType: 'AfterSalesRequest',
        resourceId: id,
        metadata: { reason },
      });
    });
    return this.detail(id, context.dealerId);
  }

  public async attach(
    id: string,
    context: DealerContext,
    file: Express.Multer.File | undefined,
    actor: AuditWriteActorContext,
  ) {
    const root = await this.requireCase(id, context.dealerId);
    const evidence = await this.evidence.validate(file);
    const stored = await this.storage.upload({
      bucket: this.runtime.config.storage.privateBucket,
      objectPath: `dealer/${this.runtime.mode}/after-sales/${id}/${randomUUID()}.${evidence.extension}`,
      bytes: evidence.bytes,
      mimeType: evidence.mimeType,
    });
    try {
      await this.transactions.run('dealer.after_sales.attach', async (tx) => {
        await lockDealerOrder(tx, root.orderItem.orderId, context.dealerId);
        const dealer = await assertDealerContext(tx, context, 'AFTER_SALES');
        const row = await tx.afterSalesRequest.findUnique({ where: { id } });
        if (row === null || !['REQUESTED', 'RECEIVED', 'INSPECTING'].includes(row.status))
          throw new ApiError('INVALID_STATE_TRANSITION');
        const attachments = parseAfterSalesAttachments(row.attachments);
        if (attachments.length >= 5)
          throw new ApiError('VALIDATION_FAILED', 'Mỗi yêu cầu có tối đa năm tệp.');
        attachments.push({
          id: randomUUID(),
          bucket: stored.bucket,
          objectPath: stored.objectPath,
          mimeType: evidence.mimeType,
          fileSize: evidence.fileSize,
          uploadedByType: 'USER',
          uploadedById: dealer.ownerUserId,
          uploadedAt: new Date().toISOString(),
        });
        await tx.afterSalesRequest.update({
          where: { id },
          data: { attachments: attachments as unknown as Prisma.InputJsonValue },
        });
        await this.audit.write(tx, actor, {
          action: 'dealer.after_sales.attachment_added',
          resourceType: 'AfterSalesRequest',
          resourceId: id,
        });
      });
    } catch (error) {
      try {
        await this.storage.delete(stored.bucket, stored.objectPath);
      } catch {
        this.logger.warn({ event: 'dealer.evidence.cleanup_failed' });
      }
      throw error;
    }
    return this.detail(id, context.dealerId);
  }

  public async warranties(orderId: string, dealerId: string) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, dealerId },
      include: { items: { include: { warranty: true } }, dealerDetail: true },
    });
    if (order === null) throw new ApiError('ORDER_NOT_FOUND');
    const brand = order.dealerDetail?.brandSnapshot as Record<string, unknown> | undefined;
    const parties = order.dealerDetail?.commercialSnapshot as Record<string, unknown> | undefined;
    return order.items.flatMap((item) =>
      item.warranty === null
        ? []
        : [
            {
              orderItemId: item.id,
              warrantyCode: item.warranty.warrantyCode,
              status: item.warranty.status,
              productName: item.productNameSnapshot,
              variantName: item.variantNameSnapshot,
              inventoryCode: item.inventoryCodeSnapshot,
              startsAt: item.warranty.startAt.toISOString(),
              endsAt: item.warranty.endAt.toISOString(),
              terms: item.warranty.termsSnapshot,
              seller: brand?.['legalName'] ?? 'Đại lý',
              brandName: brand?.['displayName'] ?? 'Đại lý',
              supportPhone: brand?.['contactPhone'] ?? '',
              supportEmail: brand?.['contactEmail'] ?? '',
              inspector: 'rePhone',
              warrantyOperator: 'rePhone',
              backupSupport: parties?.['supportPhone'] ?? '',
              recipientName: order.customerName,
            },
          ],
    );
  }

  public async attachment(
    id: string,
    attachmentId: string,
    dealerId: string,
    actor: AuditWriteActorContext,
  ) {
    await this.requireCase(id, dealerId);
    const row = await this.prisma.afterSalesRequest.findUnique({
      where: { id },
      select: { attachments: true },
    });
    const file = parseAfterSalesAttachments(row?.attachments ?? null).find(
      (item) => item.id === attachmentId,
    );
    if (file === undefined) throw new ApiError('RESOURCE_NOT_FOUND');
    await this.transactions.run('dealer.after_sales.attachment_view', (tx) =>
      this.audit.write(tx, actor, {
        action: 'dealer.after_sales.attachment_viewed',
        resourceType: 'AfterSalesRequest',
        resourceId: id,
        metadata: { attachmentId },
      }),
    );
    const url = await this.storage.createSignedReadUrl(file.bucket, file.objectPath, 300);
    return { url };
  }

  public async assess(id: string, input: DealerAssessmentDto, actor: AuditWriteActorContext) {
    const root = await this.requireCase(id);
    await this.transactions.run('dealer.after_sales.assess', async (tx) => {
      await lockDealerOrder(tx, root.orderItem.orderId);
      const row = await tx.afterSalesRequest.findUniqueOrThrow({ where: { id } });
      if (!['RECEIVED', 'INSPECTING'].includes(row.status))
        throw new ApiError('INVALID_STATE_TRANSITION');
      if (BigInt(input.shippingAlreadyPaid) > BigInt(input.shippingCost))
        throw new ApiError('VALIDATION_FAILED', 'Phần phí đã đối trừ không được vượt phí thực tế.');
      if (input.cause === 'EXISTING_DEFECT' && input.shippingPayer === 'DEALER')
        throw new ApiError('VALIDATION_FAILED', 'Lỗi thuộc rePhone: rePhone chịu phí.');
      await tx.afterSalesRequest.update({
        where: { id },
        data: {
          dealerAssessment: {
            finding: input.finding,
            cause: input.cause,
            coverage: input.coverage,
            shippingPayer: input.shippingPayer,
            shippingCost: input.shippingCost,
            shippingAlreadyPaid: input.shippingAlreadyPaid,
            feeAgreement: input.feeAgreement,
            assessedAt: new Date().toISOString(),
          },
        },
      });
      await this.audit.write(tx, actor, {
        action: 'dealer.after_sales.assessed',
        resourceType: 'AfterSalesRequest',
        resourceId: id,
        metadata: {
          cause: input.cause,
          coverage: input.coverage,
          shippingPayer: input.shippingPayer,
          shippingCost: input.shippingCost,
        },
      });
    });
    return this.detail(id);
  }

  private async requireCase(id: string, dealerId?: string) {
    const root = await this.prisma.afterSalesRequest.findFirst({
      where: {
        id,
        orderItem: {
          order: { channel: 'DEALER', ...(dealerId === undefined ? {} : { dealerId }) },
        },
      },
      select: { orderItem: { select: { orderId: true } } },
    });
    if (root === null) throw new ApiError('RESOURCE_NOT_FOUND');
    return root;
  }
}
