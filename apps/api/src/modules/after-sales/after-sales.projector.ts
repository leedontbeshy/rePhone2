import { isUUID } from 'class-validator';
import { ApiError } from '../../common/errors/api-error.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { customerAfterSalesActions } from './after-sales-policy.js';
import type {
  AfterSalesAttachmentCollectionDto,
  AfterSalesAttachmentDto,
  AfterSalesDetailDto,
  AfterSalesListItemDto,
} from './after-sales-response.dto.js';
import type { AfterSalesPublicRecord } from './after-sales.repository.js';

const ATTACHMENT_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'] as const;

export interface AfterSalesAttachmentRecord {
  id: string;
  bucket: string;
  objectPath: string;
  mimeType: (typeof ATTACHMENT_MIME_TYPES)[number];
  fileSize: number;
  uploadedByType: 'USER' | 'GUEST';
  uploadedById: string | null;
  uploadedAt: string;
}

export function projectAfterSalesListItem(request: AfterSalesPublicRecord): AfterSalesListItemDto {
  return {
    requestNumber: request.requestNumber,
    type: request.type,
    status: request.status,
    orderItem: {
      id: request.orderItem.id,
      orderNumber: request.orderItem.order.orderNumber,
      productName: request.orderItem.productNameSnapshot,
      variantName: request.orderItem.variantNameSnapshot,
      inventoryCode: request.orderItem.inventoryCodeSnapshot,
      quantity: request.orderItem.quantity,
    },
    issueDescription: request.issueDescription,
    requestedAt: request.requestedAt.toISOString(),
    updatedAt: request.updatedAt.toISOString(),
  };
}

export function projectAfterSalesDetail(
  request: AfterSalesPublicRecord,
  now: Date,
): AfterSalesDetailDto {
  const listItem = projectAfterSalesListItem(request);
  const warranty = request.warranty;
  return {
    requestNumber: listItem.requestNumber,
    type: listItem.type,
    status: listItem.status,
    orderItem: listItem.orderItem,
    issueDescription: listItem.issueDescription,
    requestedAt: listItem.requestedAt,
    updatedAt: listItem.updatedAt,
    requestedResolution: request.requestedResolution,
    warranty:
      warranty === null
        ? null
        : {
            warrantyCode: warranty.warrantyCode,
            status: warranty.status,
            startAt: warranty.startAt.toISOString(),
            endAt: warranty.endAt.toISOString(),
            isValid:
              warranty.status === 'ACTIVE' && warranty.startAt <= now && now < warranty.endAt,
            isExpired: now >= warranty.endAt,
          },
    attachments: projectAttachments(request.attachments),
    decisionNote: request.decisionNote,
    resolutionType: request.resolutionType,
    resolutionNote: request.resolutionNote,
    cancelReason: request.cancelReason,
    timeline: {
      requestedAt: request.requestedAt.toISOString(),
      receivedAt: toIso(request.receivedAt),
      inspectedAt: toIso(request.inspectedAt),
      decidedAt: toIso(request.decidedAt),
      resolvedAt: toIso(request.resolvedAt),
      returnedAt: toIso(request.returnedAt),
      cancelledAt: toIso(request.cancelledAt),
    },
    availableActions: customerAfterSalesActions(request.status),
  };
}

export function projectAttachmentCollection(
  request: Pick<AfterSalesPublicRecord, 'requestNumber' | 'attachments'>,
): AfterSalesAttachmentCollectionDto {
  return {
    requestNumber: request.requestNumber,
    attachments: projectAttachments(request.attachments),
  };
}

export function projectAttachments(value: Prisma.JsonValue | null): AfterSalesAttachmentDto[] {
  return parseAfterSalesAttachments(value).map(({ id, mimeType, fileSize, uploadedAt }) => ({
    id,
    mimeType,
    fileSize,
    uploadedAt,
  }));
}

export function parseAfterSalesAttachments(
  value: Prisma.JsonValue | null,
): AfterSalesAttachmentRecord[] {
  if (value === null) return [];
  if (!Array.isArray(value) || value.length > 5) throw new ApiError('INTERNAL_ERROR');
  return value.map(parseAttachment);
}

function parseAttachment(value: Prisma.JsonValue): AfterSalesAttachmentRecord {
  if (!isJsonObject(value)) throw new ApiError('INTERNAL_ERROR');
  const id = value['id'];
  const bucket = value['bucket'];
  const objectPath = value['objectPath'];
  const mimeType = value['mimeType'];
  const fileSize = value['fileSize'];
  const uploadedByType = value['uploadedByType'];
  const uploadedById = value['uploadedById'];
  const uploadedAt = value['uploadedAt'];
  if (
    typeof id !== 'string' ||
    !isUUID(id) ||
    typeof bucket !== 'string' ||
    bucket.length === 0 ||
    typeof objectPath !== 'string' ||
    objectPath.length === 0 ||
    typeof mimeType !== 'string' ||
    !isAttachmentMimeType(mimeType) ||
    typeof fileSize !== 'number' ||
    !Number.isInteger(fileSize) ||
    fileSize < 1 ||
    fileSize > 10 * 1024 * 1024 ||
    typeof uploadedByType !== 'string' ||
    !isUploaderType(uploadedByType) ||
    (uploadedById !== null && (typeof uploadedById !== 'string' || !isUUID(uploadedById))) ||
    typeof uploadedAt !== 'string' ||
    !isIsoDate(uploadedAt)
  ) {
    throw new ApiError('INTERNAL_ERROR');
  }
  return {
    id,
    bucket,
    objectPath,
    mimeType,
    fileSize,
    uploadedByType,
    uploadedById,
    uploadedAt,
  };
}

function isJsonObject(value: Prisma.JsonValue): value is Prisma.JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isAttachmentMimeType(value: string): value is AfterSalesAttachmentRecord['mimeType'] {
  return (ATTACHMENT_MIME_TYPES as readonly string[]).includes(value);
}

function isUploaderType(value: string): value is AfterSalesAttachmentRecord['uploadedByType'] {
  return value === 'USER' || value === 'GUEST';
}

function isIsoDate(value: string): boolean {
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString() === value;
}

function toIso(value: Date | null): string | null {
  return value?.toISOString() ?? null;
}
