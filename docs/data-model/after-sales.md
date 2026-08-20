# Data dictionary — Warranty và After-sales

## Quan hệ

```text
WarrantyPolicy 1 ── n Product/ProductVariant
OrderItem 1 ── 0..1 Warranty
Warranty/OrderItem 1 ── n AfterSalesRequest
```

## 1. WarrantyPolicy

| Field | Type | Null | Constraint/ý nghĩa |
|---|---|---:|---|
| `id` | Id | No | PK |
| `code` | ShortText | No | Unique |
| `name` | ShortText | No | Tên chính sách |
| `defaultDays` | Int | No | >= 0 |
| `terms` | LongText | No | Điều khoản hiện hành |
| `status` | PolicyStatus | No | ACTIVE, INACTIVE |
| `createdAt` | Instant | No | Default now |
| `updatedAt` | Instant | No | Auto update |
| `archivedAt` | Instant | Yes | Không xóa policy đã dùng |

Priority: số ngày = unit override → variant policy → product policy → StoreSettings default; điều khoản = variant policy → product policy → `StoreSettings.defaultWarrantyTerms`.
Policy được xem là archived khi `archivedAt != null`; archive đồng thời đặt status INACTIVE. Không cần thêm enum ARCHIVED.

## 2. Warranty

| Field | Type | Null | Constraint/ý nghĩa |
|---|---|---:|---|
| `id` | Id | No | PK |
| `warrantyCode` | ShortText | No | Unique public code |
| `orderItemId` | Id | No | FK OrderItem, unique |
| `customerId` | Id | Yes | Null với guest |
| `inventoryUnitId` | Id | Yes | Máy cụ thể |
| `policyId` | Id | Yes | Policy nguồn để truy vết |
| `daysSnapshot` | Int | No | >= 0 |
| `termsSnapshot` | LongText | No | Không đọc lại policy hiện tại |
| `startAt` | Instant | No | Khi fulfillment completed |
| `endAt` | Instant | No | > hoặc = startAt |
| `status` | WarrantyStatus | No | ACTIVE, VOIDED; expiry tính từ endAt |
| `voidReason` | LongText | Yes | Bắt buộc khi voided |
| `voidedById` | Id | Yes | FK User; bắt buộc khi VOIDED |
| `voidedAt` | Instant | Yes | Bắt buộc khi VOIDED |
| `createdAt` | Instant | No | Default now |
| `updatedAt` | Instant | No | Auto update |

Warranty dùng interval `[startAt, endAt)`: valid khi `startAt <= now < endAt`; expiry khi `now >= endAt`. `endAt = startAt + daysSnapshot * 24 giờ`. Không lưu trạng thái EXPIRED để tránh scheduled update/stale state.

Warranty được tạo trong fulfillment completion transaction khi `daysSnapshot > 0`; unique `orderItemId` bảo vệ phát hành lặp.

## 3. AfterSalesRequest

| Nhóm | Field chính | Quy tắc |
|---|---|---|
| Identity | `id`, `requestNumber` | Public code unique |
| Relation | `warrantyId`, `orderItemId`, `customerId` | Warranty nullable với return/exchange |
| Request | `type`, `issueDescription`, `requestedResolution` | Mô tả bắt buộc |
| Workflow | `status`, `assignedToId`, `receivedLocationId`, `receivedById` | Staff/admin; received location FK InventoryLocation, received actor FK User |
| Evidence | `attachments` | JSONB array: bucket, objectPath, type, uploadedBy/At |
| Inspection | `inspectionSummary`, `inventoryInspectionId` | Unit case có thể link inspection |
| Decision | `decisionNote`, `decidedById`, `decidedAt` | Bắt buộc khi APPROVED/REJECTED; actor FK User |
| Resolution | `resolutionType`, `resolutionNote`, `replacementInventoryUnitId`, `refundId`, `resolvedById` | Field theo outcome |
| Return/cancel | `returnNote`, `returnedAt`, `cancelReason` | Reject/repair/return hoặc owner cancel theo command |
| Time | `requestedAt`, `receivedAt`, `inspectedAt`, `decidedAt`, `resolvedAt`, `returnedAt`, `cancelledAt`, `createdAt`, `updatedAt` | Theo status |

Invariant:

- Warranty request cần warranty active; P0 không có override cho warranty hết hạn/void.
- `REPLACED` cần replacement unit khác unit gốc.
- `REFUNDED` cần refund liên quan hoàn tất trước khi case resolved.
- Returned iPhone chuyển INSPECTING và cần inspection mới trước khi AVAILABLE.
- Attachment luôn dùng private bucket; không lưu signed URL.
- Attachment JSON item gồm `id`, bucket/objectPath, detected mimeType/fileSize, uploadedByType/uploadedById và uploadedAt; tối đa 5 item/case.
- Partial unique ở application/SQL: tối đa một request non-terminal trên mỗi OrderItem.
- iPhone replacement được hỗ trợ trực tiếp; accessory exchange P0 dùng Refund + Order mới.
- Reject iPhone đã nhận cần `decisionNote`, `returnNote`, `returnedAt` và atomically chuyển unit về SOLD. APPROVED cần decision note/actor/time; resolution cần resolution type/note/actor/time.
- CANCELLED chỉ từ REQUESTED và cần `cancelReason`, `cancelledAt`.

## Enum baseline

- `PolicyStatus`: ACTIVE, INACTIVE.
- `WarrantyStatus`: ACTIVE, VOIDED.
- `AfterSalesType`: WARRANTY, RETURN, EXCHANGE.
- `AfterSalesStatus`: REQUESTED, RECEIVED, INSPECTING, APPROVED, REJECTED, RESOLVED, CANCELLED.
- `AfterSalesResolution`: REPAIRED, REPLACED, REFUNDED, RETURNED_UNCHANGED, OTHER.
