import {
  BackofficeWarrantyDetailDto,
  BackofficeWarrantyListItemDto,
  WarrantyDetailDto,
} from './warranty-response.dto.js';
import type { WarrantyListItemDto, WarrantyPolicyDto } from './warranty-response.dto.js';
import type {
  WarrantyOperationsRecord,
  WarrantyPolicyRecord,
} from './warranty-operations.repository.js';

export function projectWarrantyPolicy(policy: WarrantyPolicyRecord): WarrantyPolicyDto {
  return {
    id: policy.id,
    code: policy.code,
    name: policy.name,
    defaultDays: policy.defaultDays,
    terms: policy.terms,
    status: policy.status,
    isArchived: policy.archivedAt !== null,
    archivedAt: policy.archivedAt,
    createdAt: policy.createdAt,
    updatedAt: policy.updatedAt,
  };
}

export function projectWarrantyListItem(
  warranty: WarrantyOperationsRecord,
  now: Date,
): WarrantyListItemDto {
  return {
    warrantyCode: warranty.warrantyCode,
    orderNumber: warranty.orderItem.order.orderNumber,
    orderItemId: warranty.orderItemId,
    productName: warranty.orderItem.productNameSnapshot,
    variantName: warranty.orderItem.variantNameSnapshot,
    inventoryCode:
      warranty.inventoryUnit?.inventoryCode ?? warranty.orderItem.inventoryCodeSnapshot,
    daysSnapshot: warranty.daysSnapshot,
    status: warranty.status,
    startAt: warranty.startAt,
    endAt: warranty.endAt,
    isValid: warranty.status === 'ACTIVE' && warranty.startAt <= now && now < warranty.endAt,
    isExpired: now >= warranty.endAt,
  };
}

export function projectWarrantyDetail(
  warranty: WarrantyOperationsRecord,
  now: Date,
): WarrantyDetailDto {
  return Object.assign(new WarrantyDetailDto(), projectWarrantyListItem(warranty, now), {
    sku: warranty.orderItem.skuSnapshot,
    termsSnapshot: warranty.termsSnapshot,
    maskedIdentifierSuffix:
      warranty.inventoryUnit?.imei1Suffix ?? warranty.inventoryUnit?.serialSuffix ?? null,
  });
}

export function projectBackofficeWarrantyListItem(
  warranty: WarrantyOperationsRecord,
  now: Date,
): BackofficeWarrantyListItemDto {
  return Object.assign(
    new BackofficeWarrantyListItemDto(),
    projectWarrantyListItem(warranty, now),
    {
      id: warranty.id,
      customer: {
        customerId: warranty.orderItem.order.customerId,
        name: warranty.orderItem.order.customerName,
        email: warranty.orderItem.order.customerEmail,
        phone: warranty.orderItem.order.customerPhone,
      },
      policy:
        warranty.policy === null
          ? null
          : {
              id: warranty.policy.id,
              code: warranty.policy.code,
              name: warranty.policy.name,
            },
      createdAt: warranty.createdAt,
    },
  );
}

export function projectBackofficeWarrantyDetail(
  warranty: WarrantyOperationsRecord,
  now: Date,
): BackofficeWarrantyDetailDto {
  return Object.assign(
    new BackofficeWarrantyDetailDto(),
    projectBackofficeWarrantyListItem(warranty, now),
    {
      sku: warranty.orderItem.skuSnapshot,
      termsSnapshot: warranty.termsSnapshot,
      maskedIdentifierSuffix:
        warranty.inventoryUnit?.imei1Suffix ?? warranty.inventoryUnit?.serialSuffix ?? null,
      voidReason: warranty.voidReason,
      voidedBy:
        warranty.voidedBy === null
          ? null
          : { id: warranty.voidedBy.id, fullName: warranty.voidedBy.fullName },
      voidedAt: warranty.voidedAt,
      updatedAt: warranty.updatedAt,
    },
  );
}
