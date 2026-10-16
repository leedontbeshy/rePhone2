import { Inject, Injectable } from '@nestjs/common';
import { ApiError } from '../../common/errors/api-error.js';
import { PrismaService } from '../../database/prisma.service.js';
import { SerializableTransactionRunner } from '../../database/serializable-transaction.runner.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { AuditWriter } from '../audit/audit-writer.service.js';
import type { AuditActorContext } from '../audit/audit.types.js';
import { CheckoutCatalogReader } from '../catalog/checkout-catalog.reader.js';
import { CheckoutInventoryGateway } from '../inventory/checkout-inventory.gateway.js';
import { resolveWarranty } from '../orders/checkout-pricing.js';
import { CheckoutSettingsReader } from '../settings/checkout-settings.reader.js';
import { DealerCatalogReader } from './dealer-catalog.reader.js';
import { dealerPrice } from './dealer-pricing.policy.js';
import { canonicalDealerJson, dealerHash, DealerRuntime } from './dealer-runtime.service.js';
import type {
  DealerInventoryOverrideDto,
  DealerChannelDto,
  DealerCatalogQuery,
  DealerPreviewDto,
  DealerPricingDto,
  DealerShippingQuoteDto,
} from './dealer.dto.js';

export function dealerAddressFingerprint(address: DealerPreviewDto['shippingAddress']): string {
  return dealerHash(canonicalDealerJson(address));
}

@Injectable()
export class DealerCatalogService {
  public constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(SerializableTransactionRunner)
    private readonly transactions: SerializableTransactionRunner,
    @Inject(DealerRuntime) private readonly runtime: DealerRuntime,
    @Inject(CheckoutCatalogReader) private readonly catalog: CheckoutCatalogReader,
    @Inject(CheckoutInventoryGateway) private readonly inventory: CheckoutInventoryGateway,
    @Inject(CheckoutSettingsReader) private readonly settings: CheckoutSettingsReader,
    @Inject(DealerCatalogReader) private readonly listing: DealerCatalogReader,
    @Inject(AuditWriter) private readonly audit: AuditWriter,
  ) {}

  public async configuration() {
    const policy = this.runtime.enabled
      ? await this.prisma.dealerPricingPolicy.findUnique({ where: { key: 'GLOBAL' } })
      : null;
    return {
      enabled: this.runtime.enabled,
      open: policy?.enabled === true,
      environment: this.runtime.mode,
      pricingReady:
        policy?.reserveAmount != null &&
        policy.minimumProfit != null &&
        BigInt(policy.minimumProfit.toString()) > 0n,
      version: policy?.version ?? null,
      termsVersion: this.runtime.termsVersion,
      connection: this.runtime.connectionInfo(),
    };
  }

  public async setChannel(input: DealerChannelDto, actor: AuditActorContext) {
    this.runtime.assertEnabled();
    await this.transactions.run('dealer.channel.update', async (tx) => {
      const policy = await tx.dealerPricingPolicy.findUnique({ where: { key: 'GLOBAL' } });
      if (policy === null || policy.version !== input.expectedVersion)
        throw new ApiError('SETTINGS_VERSION_CONFLICT');
      if (
        input.open &&
        (policy.reserveAmount === null ||
          policy.minimumProfit === null ||
          BigInt(policy.minimumProfit.toString()) <= 0n)
      )
        throw new ApiError(
          'VALIDATION_FAILED',
          'Lưu dự phòng và lãi tối thiểu trong Giá & vận chuyển trước khi mở cổng.',
        );
      const changed = await tx.dealerPricingPolicy.updateMany({
        where: { key: 'GLOBAL', version: input.expectedVersion },
        data: { enabled: input.open, version: { increment: 1 }, updatedById: actor.actorUserId },
      });
      if (changed.count !== 1) throw new ApiError('SETTINGS_VERSION_CONFLICT');
      await this.audit.write(tx, actor, {
        action: 'dealer.channel.updated',
        resourceType: 'DealerPricingPolicy',
        changes: { before: { open: policy.enabled }, after: { open: input.open } },
        metadata: { reason: input.reason, version: input.expectedVersion + 1 },
      });
    });
    return this.configuration();
  }

  public async inventoryPricing(id: string) {
    this.runtime.assertEnabled();
    const [unit, policy] = await Promise.all([
      this.prisma.inventoryUnit.findUnique({ where: { id }, include: { dealerOverride: true } }),
      this.prisma.dealerPricingPolicy.findUnique({ where: { key: 'GLOBAL' } }),
    ]);
    if (unit === null || policy === null) throw new ApiError('RESOURCE_NOT_FOUND');
    const price = dealerPrice({
      publicPrice: amount(unit.salePrice),
      acquisitionCost: amount(unit.acquisitionCost),
      additionalCost: BigInt(unit.additionalCost.toString()),
      reserve: amount(policy.reserveAmount),
      minimumProfit: amount(policy.minimumProfit),
      discountBps: policy.discountBps,
      override: amount(unit.dealerOverride?.price ?? null),
    });
    const floor =
      unit.acquisitionCost !== null &&
      policy.reserveAmount !== null &&
      policy.minimumProfit !== null
        ? BigInt(unit.acquisitionCost.toString()) +
          BigInt(unit.additionalCost.toString()) +
          BigInt(policy.reserveAmount.toString()) +
          BigInt(policy.minimumProfit.toString())
        : null;
    return {
      inventoryUnitId: id,
      inventoryCode: unit.inventoryCode,
      enabled: unit.dealerOverride?.enabled ?? true,
      overridePrice: unit.dealerOverride?.price?.toString() ?? null,
      publicPrice: unit.salePrice?.toString() ?? null,
      dealerPrice: price?.toString() ?? null,
      floorPrice: floor?.toString() ?? null,
      channelOpen: policy.enabled,
    };
  }

  public async policy() {
    this.runtime.assertEnabled();
    const row = await this.prisma.dealerPricingPolicy.findUnique({ where: { key: 'GLOBAL' } });
    if (row === null) throw new ApiError('SERVICE_UNAVAILABLE');
    return {
      ...row,
      reserveAmount: row.reserveAmount?.toString() ?? null,
      minimumProfit: row.minimumProfit?.toString() ?? null,
      shippingFee: row.shippingFee.toString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  public async updatePolicy(input: DealerPricingDto, actor: AuditActorContext) {
    this.runtime.assertEnabled();
    await this.transactions.run('dealer.pricing.update', async (tx) => {
      const changed = await tx.dealerPricingPolicy.updateMany({
        where: { key: 'GLOBAL', version: input.expectedVersion },
        data: {
          enabled: input.enabled,
          discountBps: input.discountBps,
          reserveAmount: input.reserveAmount,
          minimumProfit: input.minimumProfit,
          shippingFee: input.shippingFee,
          supportedProvinces: [...new Set(input.supportedProvinces.map((value) => value.trim()))],
          version: { increment: 1 },
          updatedById: actor.actorUserId,
        },
      });
      if (changed.count !== 1) throw new ApiError('SETTINGS_VERSION_CONFLICT');
      await this.audit.write(tx, actor, {
        action: 'dealer.pricing.updated',
        resourceType: 'DealerPricingPolicy',
        metadata: { version: input.expectedVersion + 1 },
      });
    });
    return this.policy();
  }

  public async override(id: string, input: DealerInventoryOverrideDto, actor: AuditActorContext) {
    this.runtime.assertEnabled();
    await this.transactions.run('dealer.pricing.override', async (tx) => {
      const unit = await tx.inventoryUnit.findUnique({ where: { id } });
      const policy = await tx.dealerPricingPolicy.findUnique({ where: { key: 'GLOBAL' } });
      if (unit === null || policy === null) throw new ApiError('RESOURCE_NOT_FOUND');
      if (
        input.enabled &&
        input.price !== undefined &&
        dealerPrice({
          publicPrice: amount(unit.salePrice),
          acquisitionCost: amount(unit.acquisitionCost),
          additionalCost: BigInt(unit.additionalCost.toString()),
          reserve: amount(policy.reserveAmount),
          minimumProfit: amount(policy.minimumProfit),
          discountBps: policy.discountBps,
          override: BigInt(input.price),
        }) === null
      )
        throw new ApiError(
          'VALIDATION_FAILED',
          'Giá đại lý phải đạt giá sàn và thấp hơn giá tham chiếu.',
        );
      const data = {
        enabled: input.enabled,
        price: input.price ?? null,
        reason: input.reason,
        updatedById: actor.actorUserId,
      };
      await tx.dealerInventoryOverride.upsert({
        where: { inventoryUnitId: id },
        create: { inventoryUnitId: id, ...data },
        update: data,
      });
      await this.audit.write(tx, actor, {
        action: 'dealer.price.override',
        resourceType: 'InventoryUnit',
        resourceId: id,
        metadata: { reason: input.reason },
      });
    });
    return { inventoryUnitId: id, enabled: input.enabled };
  }

  public async quote(input: DealerShippingQuoteDto, actor: AuditActorContext) {
    this.runtime.assertEnabled();
    return this.transactions.run('dealer.shipping.quote', async (tx) => {
      const row = await tx.dealerShippingQuote.create({
        data: {
          dealerId: input.dealerId,
          addressFingerprint: dealerAddressFingerprint(input.shippingAddress),
          shippingFee: input.shippingFee,
          expiresAt: new Date(Date.now() + 86400_000),
          createdById: actor.actorUserId,
          reason: input.reason,
        },
      });
      await this.audit.write(tx, actor, {
        action: 'dealer.shipping.quoted',
        resourceType: 'DealerShippingQuote',
        resourceId: row.id,
      });
      return {
        id: row.id,
        shippingFee: row.shippingFee.toString(),
        expiresAt: row.expiresAt.toISOString(),
      };
    });
  }

  public list(query: DealerCatalogQuery) {
    this.runtime.assertEnabled();
    return this.listing.list(query);
  }

  public preview(dealerId: string, input: DealerPreviewDto) {
    return this.prisma.$transaction(
      async (tx) => (await this.calculate(dealerId, input, tx)).preview,
      { isolationLevel: 'RepeatableRead' },
    );
  }

  public async offer(inventoryUnitId: string, tx: Prisma.TransactionClient) {
    this.runtime.assertEnabled();
    const policy = await tx.dealerPricingPolicy.findUnique({ where: { key: 'GLOBAL' } });
    const unit = await tx.inventoryUnit.findUnique({
      where: { id: inventoryUnitId },
      include: { dealerOverride: true },
    });
    if (
      policy === null ||
      !policy.enabled ||
      unit === null ||
      unit.dealerOverride?.enabled === false
    )
      throw new ApiError('INVENTORY_NOT_AVAILABLE');
    const price = dealerPrice({
      publicPrice: amount(unit.salePrice),
      acquisitionCost: amount(unit.acquisitionCost),
      additionalCost: BigInt(unit.additionalCost.toString()),
      reserve: amount(policy.reserveAmount),
      minimumProfit: amount(policy.minimumProfit),
      discountBps: policy.discountBps,
      override: amount(unit.dealerOverride?.price ?? null),
    });
    if (price === null) throw new ApiError('INVENTORY_NOT_AVAILABLE');
    // The checkout correlation key is independent of a cart: no synthetic cart is persisted.
    const [line] = await this.catalog.readLines(
      [{ cartItemId: unit.id, inventoryUnitId: unit.id, variantId: unit.variantId, quantity: 1 }],
      tx,
    );
    if (line === undefined) throw new ApiError('INVENTORY_NOT_AVAILABLE');
    const settings = await this.settings.read(tx);
    const warranty = resolveWarranty(line, settings);
    const allocation = await this.inventory.selectLocation([line], 'SHIPPING', tx);
    const publicOffer = {
      inventoryUnitId: unit.id,
      inventoryCode: unit.inventoryCode,
      productName: line.productName,
      variantName: line.variantName,
      sku: line.sku,
      configuration: line.configurationSnapshot,
      dealerPrice: price.toString(),
      publicReferencePrice: line.unitPrice,
      recommendedRetailPrice: line.unitPrice,
      warrantyDays: warranty.days,
      warrantyTerms: warranty.terms,
    };
    return { policy, line, settings, allocation, warranty, publicOffer };
  }

  public async calculate(dealerId: string, input: DealerPreviewDto, tx: Prisma.TransactionClient) {
    const offer = await this.offer(input.inventoryUnitId, tx);
    const addressFingerprint = dealerAddressFingerprint(input.shippingAddress);
    let shippingFee: string;
    if (input.shippingQuoteId !== undefined) {
      const quote = await tx.dealerShippingQuote.findFirst({
        where: {
          id: input.shippingQuoteId,
          dealerId,
          addressFingerprint,
          expiresAt: { gt: new Date() },
        },
      });
      if (quote === null)
        throw new ApiError(
          'CHECKOUT_REVIEW_REQUIRED',
          'Báo giá vận chuyển đã hết hạn hoặc không khớp địa chỉ.',
        );
      shippingFee = quote.shippingFee.toString();
    } else {
      if (
        !offer.policy.supportedProvinces.some(
          (province) =>
            province.normalize('NFC').toLocaleLowerCase('vi') ===
            input.shippingAddress.province.trim().normalize('NFC').toLocaleLowerCase('vi'),
        )
      )
        throw new ApiError(
          'CHECKOUT_REVIEW_REQUIRED',
          'Địa chỉ này cần nhân viên báo phí giao hàng trước khi giữ máy.',
        );
      shippingFee = offer.policy.shippingFee.toString();
    }
    const details = {
      ...offer.publicOffer,
      shippingFee,
      grandTotal: (BigInt(offer.publicOffer.dealerPrice) + BigInt(shippingFee)).toString(),
      addressFingerprint,
      pricingPolicyVersion: offer.policy.version,
      shippingQuoteId: input.shippingQuoteId ?? null,
    };
    const previewFingerprint = dealerHash(canonicalDealerJson({ dealerId, ...details }));
    return {
      ...offer,
      preview: { ...details, previewFingerprint, holdsInventory: false as const },
    };
  }
}

function amount(value: { toString(): string } | null): bigint | null {
  return value === null ? null : BigInt(value.toString());
}
