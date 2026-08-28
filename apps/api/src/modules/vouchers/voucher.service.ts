import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { ApiError } from '../../common/errors/api-error.js';
import { PaginatedApiResult } from '../../common/http/api-response.interceptor.js';
import { SerializableTransactionRunner } from '../../database/serializable-transaction.runner.js';
import { AuditWriter } from '../audit/audit-writer.service.js';
import type { AuditActorContext } from '../audit/audit.types.js';
import type { AuthContext } from '../auth/auth-context.js';
import type {
  BackofficeVoucherListQueryDto,
  CreateVoucherDto,
  PublicVoucherListQueryDto,
  UpdateVoucherDto,
  VoucherUsageListQueryDto,
} from './voucher.dto.js';
import type { VoucherScopeConfigDto } from './voucher-scope.dto.js';
import { parseVoucherScope, type VoucherScope } from './voucher-policy.js';
import type {
  BackofficeVoucherDto,
  PublicVoucherDto,
  VoucherUsageDto,
} from './voucher-response.dto.js';
import { VoucherRepository, type VoucherRecord } from './voucher.repository.js';

const RULE_FIELDS = [
  'discountType',
  'discountValue',
  'maxDiscountAmount',
  'minimumOrderAmount',
  'startsAt',
  'endsAt',
  'totalUsageLimit',
  'perCustomerLimit',
  'visibility',
  'scopeType',
  'scopeConfig',
] as const;

interface EffectiveVoucherRule {
  discountType: 'FIXED' | 'PERCENT';
  discountValue: string;
  maxDiscountAmount: string | null;
  minimumOrderAmount: string;
  startsAt: Date;
  endsAt: Date;
  totalUsageLimit: number | null;
  perCustomerLimit: number | null;
  visibility: 'PUBLIC' | 'ACCOUNT_ONLY';
  scopeType: 'ORDER' | 'PRODUCT_TYPE' | 'PRODUCTS' | 'VARIANTS';
  scopeConfig: unknown;
}

@Injectable()
export class VoucherService {
  public constructor(
    @Inject(VoucherRepository) private readonly vouchers: VoucherRepository,
    @Inject(SerializableTransactionRunner)
    private readonly transactions: SerializableTransactionRunner,
    @Inject(AuditWriter) private readonly audit: AuditWriter,
  ) {}

  public async listPublic(query: PublicVoucherListQueryDto, auth?: AuthContext) {
    const allowed: Array<'PUBLIC' | 'ACCOUNT_ONLY'> =
      auth?.role === 'CUSTOMER' ? ['PUBLIC', 'ACCOUNT_ONLY'] : ['PUBLIC'];
    if (query.visibility === 'ACCOUNT_ONLY' && !allowed.includes('ACCOUNT_ONLY')) {
      return new PaginatedApiResult<PublicVoucherDto>([], pagination(query, 0));
    }
    const result = await this.vouchers.listPublic(query, allowed);
    const items = result.items
      .filter((voucher) => !quotaExhausted(voucher))
      .map((voucher) => toPublicVoucher(voucher));
    return new PaginatedApiResult(
      items,
      pagination(query, items.length === 0 ? 0 : result.totalItems),
    );
  }

  public async listBackoffice(query: BackofficeVoucherListQueryDto) {
    const result = await this.vouchers.listBackoffice(query);
    return new PaginatedApiResult(
      result.items.map(toBackofficeVoucher),
      pagination(query, result.totalItems),
    );
  }

  public async get(id: string): Promise<BackofficeVoucherDto> {
    const voucher = await this.vouchers.find(id);
    if (voucher === null) throw new ApiError('RESOURCE_NOT_FOUND');
    return toBackofficeVoucher(voucher);
  }

  public async create(
    input: CreateVoucherDto,
    actor: AuditActorContext,
  ): Promise<BackofficeVoucherDto> {
    const rule = createRule(input);
    const scope = parseVoucherScope(rule.scopeType, rule.scopeConfig);
    assertRule(rule);
    try {
      const voucher = await this.transactions.run('voucher.create', async (transaction) => {
        await assertScopeTargets(scope, transaction);
        const created = await transaction.voucher.create({
          data: {
            code: input.code,
            normalizedCode: input.code,
            name: input.name,
            description: input.description ?? null,
            discountType: input.discountType,
            discountValue: input.discountValue,
            maxDiscountAmount: input.maxDiscountAmount ?? null,
            minimumOrderAmount: input.minimumOrderAmount,
            startsAt: new Date(input.startsAt),
            endsAt: new Date(input.endsAt),
            totalUsageLimit: input.totalUsageLimit ?? null,
            perCustomerLimit: input.perCustomerLimit ?? null,
            visibility: input.visibility,
            scopeType: input.scopeType,
            scopeConfig: jsonInput(input.scopeConfig),
            status: 'DRAFT',
          },
          include: { usages: { select: { status: true } } },
        });
        await this.audit.write(transaction, actor, {
          action: 'voucher.created',
          resourceType: 'Voucher',
          resourceId: created.id,
          changes: { after: auditSnapshot(created) },
        });
        return created;
      });
      return toBackofficeVoucher(voucher);
    } catch (error) {
      mapUniqueError(error);
    }
  }

  public async update(
    id: string,
    input: UpdateVoucherDto,
    actor: AuditActorContext,
  ): Promise<BackofficeVoucherDto> {
    const voucher = await this.transactions.run('voucher.update', async (transaction) => {
      await this.vouchers.lock(id, transaction);
      const existing = await this.vouchers.find(id, transaction);
      if (existing === null) throw new ApiError('RESOURCE_NOT_FOUND');
      assertMutable(existing, input);
      const rule = mergeRule(existing, input);
      const scope = parseVoucherScope(rule.scopeType, rule.scopeConfig);
      assertRule(rule);
      await assertScopeTargets(scope, transaction);
      const updated = await transaction.voucher.update({
        where: { id },
        data: updateData(input),
        include: { usages: { select: { status: true } } },
      });
      await this.audit.write(transaction, actor, {
        action: 'voucher.updated',
        resourceType: 'Voucher',
        resourceId: id,
        changes: { before: auditSnapshot(existing), after: auditSnapshot(updated) },
      });
      return updated;
    });
    return toBackofficeVoucher(voucher);
  }

  public async activate(id: string, actor: AuditActorContext): Promise<BackofficeVoucherDto> {
    return this.transition(
      id,
      'ACTIVE',
      'voucher.activated',
      actor,
      undefined,
      async (existing, tx) => {
        if (!['DRAFT', 'PAUSED'].includes(existing.status)) {
          throw new ApiError('INVALID_STATE_TRANSITION');
        }
        const rule = mergeRule(existing, {});
        if (rule.endsAt <= new Date()) throw new ApiError('INVALID_STATE_TRANSITION');
        assertRule(rule);
        await assertScopeTargets(parseVoucherScope(rule.scopeType, rule.scopeConfig), tx);
      },
    );
  }

  public async pause(
    id: string,
    reason: string,
    actor: AuditActorContext,
  ): Promise<BackofficeVoucherDto> {
    return this.transition(id, 'PAUSED', 'voucher.paused', actor, reason, (existing) => {
      if (existing.status !== 'ACTIVE') throw new ApiError('INVALID_STATE_TRANSITION');
      return Promise.resolve();
    });
  }

  public async archive(
    id: string,
    reason: string,
    actor: AuditActorContext,
  ): Promise<BackofficeVoucherDto> {
    return this.transition(id, 'ARCHIVED', 'voucher.archived', actor, reason, (existing) => {
      if (existing.status === 'ARCHIVED') throw new ApiError('INVALID_STATE_TRANSITION');
      return Promise.resolve();
    });
  }

  public async listUsages(id: string, query: VoucherUsageListQueryDto) {
    if ((await this.vouchers.find(id)) === null) throw new ApiError('RESOURCE_NOT_FOUND');
    const result = await this.vouchers.listUsages(id, query);
    return new PaginatedApiResult<VoucherUsageDto>(
      result.items.map((usage) => ({
        id: usage.id,
        orderId: usage.orderId,
        orderNumber: usage.order.orderNumber,
        customerId: usage.customerId,
        customer:
          usage.customer === null
            ? null
            : { name: usage.customer.fullName, email: usage.customer.email },
        status: usage.status,
        createdAt: usage.createdAt,
        consumedAt: usage.consumedAt,
        releasedAt: usage.releasedAt,
      })),
      pagination(query, result.totalItems),
    );
  }

  private async transition(
    id: string,
    status: 'ACTIVE' | 'PAUSED' | 'ARCHIVED',
    action: string,
    actor: AuditActorContext,
    reason: string | undefined,
    validate: (existing: VoucherRecord, tx: Prisma.TransactionClient) => Promise<void>,
  ): Promise<BackofficeVoucherDto> {
    const voucher = await this.transactions.run(action, async (transaction) => {
      await this.vouchers.lock(id, transaction);
      const existing = await this.vouchers.find(id, transaction);
      if (existing === null) throw new ApiError('RESOURCE_NOT_FOUND');
      await validate(existing, transaction);
      const updated = await transaction.voucher.update({
        where: { id },
        data: { status },
        include: { usages: { select: { status: true } } },
      });
      await this.audit.write(transaction, actor, {
        action,
        resourceType: 'Voucher',
        resourceId: id,
        changes: { before: { status: existing.status }, after: { status } },
        ...(reason === undefined ? {} : { metadata: { reason } }),
      });
      return updated;
    });
    return toBackofficeVoucher(voucher);
  }
}

function createRule(input: CreateVoucherDto): EffectiveVoucherRule {
  return {
    discountType: input.discountType,
    discountValue: input.discountValue,
    maxDiscountAmount: input.maxDiscountAmount ?? null,
    minimumOrderAmount: input.minimumOrderAmount,
    startsAt: new Date(input.startsAt),
    endsAt: new Date(input.endsAt),
    totalUsageLimit: input.totalUsageLimit ?? null,
    perCustomerLimit: input.perCustomerLimit ?? null,
    visibility: input.visibility,
    scopeType: input.scopeType,
    scopeConfig: input.scopeConfig ?? null,
  };
}

function mergeRule(existing: VoucherRecord, input: UpdateVoucherDto): EffectiveVoucherRule {
  return {
    discountType: input.discountType ?? existing.discountType,
    discountValue: input.discountValue ?? existing.discountValue.toString(),
    maxDiscountAmount: has(input, 'maxDiscountAmount')
      ? (input.maxDiscountAmount ?? null)
      : (existing.maxDiscountAmount?.toString() ?? null),
    minimumOrderAmount: input.minimumOrderAmount ?? existing.minimumOrderAmount.toString(),
    startsAt: input.startsAt === undefined ? existing.startsAt : new Date(input.startsAt),
    endsAt: input.endsAt === undefined ? existing.endsAt : new Date(input.endsAt),
    totalUsageLimit: has(input, 'totalUsageLimit')
      ? (input.totalUsageLimit ?? null)
      : existing.totalUsageLimit,
    perCustomerLimit: has(input, 'perCustomerLimit')
      ? (input.perCustomerLimit ?? null)
      : existing.perCustomerLimit,
    visibility: input.visibility ?? existing.visibility,
    scopeType: input.scopeType ?? existing.scopeType,
    scopeConfig: has(input, 'scopeConfig') ? (input.scopeConfig ?? null) : existing.scopeConfig,
  };
}

function assertRule(rule: EffectiveVoucherRule): void {
  const discountValue = BigInt(rule.discountValue);
  const maxDiscount = rule.maxDiscountAmount === null ? null : BigInt(rule.maxDiscountAmount);
  if (
    discountValue <= 0n ||
    BigInt(rule.minimumOrderAmount) < 0n ||
    rule.endsAt <= rule.startsAt ||
    (rule.discountType === 'FIXED' && maxDiscount !== null) ||
    (rule.discountType === 'PERCENT' &&
      (discountValue < 1n ||
        discountValue > 100n ||
        (maxDiscount !== null && maxDiscount <= 0n))) ||
    (rule.visibility === 'PUBLIC' && rule.perCustomerLimit !== null)
  ) {
    throw new ApiError('VALIDATION_FAILED');
  }
}

function assertMutable(existing: VoucherRecord, input: UpdateVoucherDto): void {
  if (existing.status === 'ARCHIVED') throw new ApiError('INVALID_STATE_TRANSITION');
  const fields = Object.keys(input).filter(
    (key) => input[key as keyof UpdateVoucherDto] !== undefined,
  );
  const changedRules = fields.filter((key) =>
    RULE_FIELDS.includes(key as (typeof RULE_FIELDS)[number]),
  );
  if (existing.status === 'ACTIVE' && changedRules.length > 0) {
    throw new ApiError('INVALID_STATE_TRANSITION');
  }
  if (existing.status === 'PAUSED' && existing.usages.length > 0) {
    const forbidden = changedRules.filter((key) => key !== 'endsAt');
    const nextEndsAt = input.endsAt === undefined ? existing.endsAt : new Date(input.endsAt);
    if (forbidden.length > 0 || nextEndsAt < existing.endsAt) {
      throw new ApiError('INVALID_STATE_TRANSITION');
    }
  }
}

async function assertScopeTargets(
  scope: VoucherScope,
  transaction: Prisma.TransactionClient,
): Promise<void> {
  if (scope.type === 'PRODUCTS') {
    const count = await transaction.product.count({
      where: { id: { in: scope.productIds }, status: { not: 'ARCHIVED' }, archivedAt: null },
    });
    if (count !== scope.productIds.length) throw new ApiError('VALIDATION_FAILED');
  }
  if (scope.type === 'VARIANTS') {
    const count = await transaction.productVariant.count({
      where: { id: { in: scope.variantIds }, status: { not: 'ARCHIVED' }, archivedAt: null },
    });
    if (count !== scope.variantIds.length) throw new ApiError('VALIDATION_FAILED');
  }
}

function updateData(input: UpdateVoucherDto): Prisma.VoucherUpdateInput {
  return {
    ...(input.name === undefined ? {} : { name: input.name }),
    ...(input.description === undefined ? {} : { description: input.description }),
    ...(input.discountType === undefined ? {} : { discountType: input.discountType }),
    ...(input.discountValue === undefined ? {} : { discountValue: input.discountValue }),
    ...(has(input, 'maxDiscountAmount')
      ? { maxDiscountAmount: input.maxDiscountAmount ?? null }
      : {}),
    ...(input.minimumOrderAmount === undefined
      ? {}
      : { minimumOrderAmount: input.minimumOrderAmount }),
    ...(input.startsAt === undefined ? {} : { startsAt: new Date(input.startsAt) }),
    ...(input.endsAt === undefined ? {} : { endsAt: new Date(input.endsAt) }),
    ...(has(input, 'totalUsageLimit') ? { totalUsageLimit: input.totalUsageLimit ?? null } : {}),
    ...(has(input, 'perCustomerLimit') ? { perCustomerLimit: input.perCustomerLimit ?? null } : {}),
    ...(input.visibility === undefined ? {} : { visibility: input.visibility }),
    ...(input.scopeType === undefined ? {} : { scopeType: input.scopeType }),
    ...(has(input, 'scopeConfig') ? { scopeConfig: jsonInput(input.scopeConfig) } : {}),
  };
}

function jsonInput(
  value: VoucherScopeConfigDto | null | undefined,
): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput {
  return value === null || value === undefined
    ? Prisma.DbNull
    : (value as unknown as Prisma.InputJsonObject);
}

function quotaExhausted(voucher: VoucherRecord): boolean {
  if (voucher.totalUsageLimit === null) return false;
  const counted = voucher.usages.filter((usage) => usage.status !== 'RELEASED').length;
  return counted >= voucher.totalUsageLimit;
}

function toPublicVoucher(voucher: VoucherRecord): PublicVoucherDto {
  return {
    code: voucher.code,
    name: voucher.name,
    description: voucher.description,
    discountType: voucher.discountType,
    discountValue: voucher.discountValue.toString(),
    maxDiscountAmount: voucher.maxDiscountAmount?.toString() ?? null,
    minimumOrderAmount: voucher.minimumOrderAmount.toString(),
    startsAt: voucher.startsAt,
    endsAt: voucher.endsAt,
    visibility: voucher.visibility,
    scopeSummary: scopeSummary(parseVoucherScope(voucher.scopeType, voucher.scopeConfig)),
  };
}

function toBackofficeVoucher(voucher: VoucherRecord): BackofficeVoucherDto {
  const counts = usageCounts(voucher);
  return {
    id: voucher.id,
    code: voucher.code,
    name: voucher.name,
    description: voucher.description,
    discountType: voucher.discountType,
    discountValue: voucher.discountValue.toString(),
    maxDiscountAmount: voucher.maxDiscountAmount?.toString() ?? null,
    minimumOrderAmount: voucher.minimumOrderAmount.toString(),
    startsAt: voucher.startsAt,
    endsAt: voucher.endsAt,
    totalUsageLimit: voucher.totalUsageLimit,
    perCustomerLimit: voucher.perCustomerLimit,
    visibility: voucher.visibility,
    scopeType: voucher.scopeType,
    scopeConfig: voucher.scopeConfig as VoucherScopeConfigDto | null,
    status: voucher.status,
    usageCounts: counts,
    createdAt: voucher.createdAt,
    updatedAt: voucher.updatedAt,
  };
}

function usageCounts(voucher: VoucherRecord) {
  return {
    reserved: voucher.usages.filter((usage) => usage.status === 'RESERVED').length,
    consumed: voucher.usages.filter((usage) => usage.status === 'CONSUMED').length,
    released: voucher.usages.filter((usage) => usage.status === 'RELEASED').length,
  };
}

function scopeSummary(scope: VoucherScope): string {
  switch (scope.type) {
    case 'ORDER':
      return 'Toàn bộ đơn hàng';
    case 'PRODUCT_TYPE':
      return scope.productType === 'IPHONE' ? 'Sản phẩm iPhone' : 'Sản phẩm phụ kiện';
    case 'PRODUCTS':
      return `${scope.productIds.length.toString()} sản phẩm được chọn`;
    case 'VARIANTS':
      return `${scope.variantIds.length.toString()} phiên bản được chọn`;
  }
}

function auditSnapshot(voucher: VoucherRecord) {
  return {
    code: voucher.code,
    status: voucher.status,
    discountType: voucher.discountType,
    discountValue: voucher.discountValue.toString(),
    visibility: voucher.visibility,
    scopeType: voucher.scopeType,
    startsAt: voucher.startsAt.toISOString(),
    endsAt: voucher.endsAt.toISOString(),
  };
}

function pagination(query: { page: number; pageSize: number }, totalItems: number) {
  return {
    page: query.page,
    pageSize: query.pageSize,
    totalItems,
    totalPages: Math.ceil(totalItems / query.pageSize),
  };
}

function has(value: object, key: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function mapUniqueError(error: unknown): never {
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'P2002'
  ) {
    throw new ApiError('DUPLICATE_RESOURCE');
  }
  throw error;
}
