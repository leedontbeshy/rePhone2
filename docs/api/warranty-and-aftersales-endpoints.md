# Warranty và After-sales endpoints

P0 quản lý warranty đã phát hành và case hậu mãi ở mức intake/inspection/decision/resolution. Không quản lý kỹ thuật viên, repair task, linh kiện hoặc chi phí sửa chữa.

## 1. Storefront Warranty

| Method/path | Actor | Success |
|---|---|---|
| `GET /api/v1/warranties` | CUSTOMER | `200 WarrantyListItemDto[]` + pagination |
| `GET /api/v1/warranties/:warrantyCode` | Owner CUSTOMER hoặc guest Order credential | `200 WarrantyDetailDto` |

- Customer list chỉ warranty có customerId là caller. Guest không list; detail dùng `X-Guest-Order-Token` của Order chứa OrderItem.
- `warrantyCode` public không phải secret; sai ownership/token trả `RESOURCE_NOT_FOUND`.
- DTO dùng OrderItem snapshot, unit inventoryCode/masked suffix, days/terms snapshot, start/end/status và computed `isExpired/isValid`.
- Warranty valid khi `status=ACTIVE` và `startAt <= now < endAt`.

## 2. Storefront After-sales

| Method/path | Actor | Request | Success |
|---|---|---|---|
| `GET /api/v1/after-sales` | CUSTOMER | Filter/pagination | `200 AfterSalesListItemDto[]` |
| `POST /api/v1/after-sales` | CUSTOMER hoặc guest Order credential | Create DTO | `201 AfterSalesDetailDto` |
| `GET /api/v1/after-sales/:requestNumber` | Owner CUSTOMER hoặc guest credential | — | `200 AfterSalesDetailDto` |
| `POST /api/v1/after-sales/:requestNumber/attachments` | Owner, multipart one `file` | — | Updated attachment summary |
| `GET /api/v1/after-sales/:requestNumber/attachments/:attachmentId/url` | Owner | — | Signed URL <= 5 phút |
| `POST /api/v1/after-sales/:requestNumber/cancel` | Owner | `reason` | CANCELLED detail |

### Create DTO

```text
orderItemId
type: WARRANTY | RETURN | EXCHANGE
issueDescription
requestedResolution?
```

- Order phải COMPLETED và caller sở hữu OrderItem.
- WARRANTY yêu cầu Warranty hiện valid; `warrantyId` backend resolve, client không chọn warranty khác.
- RETURN/EXCHANGE không có hard-coded day window trong P0; staff quyết định theo chính sách/description. Việc nhận request không đồng nghĩa approve.
- Tối đa một AfterSalesRequest non-terminal trên mỗi OrderItem.
- `issueDescription` 10..2000; requestedResolution optional <=500.
- Backend sinh `requestNumber` dạng `RPH-AS-YYYYMMDD-XXXXXX`.
- Guest request lưu customerId null nhưng ownership suy từ Order; request number không cấp quyền.

### Attachment/cancel

- JPEG/PNG/WebP/PDF <=10 MiB, tối đa 5 attachment/case; backend upload private và append metadata có attachment UUID.
- Owner được attach khi REQUESTED/RECEIVED/INSPECTING; terminal case không nhận file mới.
- Signed URL authorize từng attachment, không trả object path.
- Owner chỉ cancel REQUESTED. Các state sau phải liên hệ staff; reason 5..500.

## 3. Backoffice WarrantyPolicy

| Method/path | Actor | Request | Success |
|---|---|---|---|
| `GET /api/v1/backoffice/warranty-policies` | Staff/Admin | Filter/pagination | Policy list |
| `POST /api/v1/backoffice/warranty-policies` | ADMIN | Create DTO | `201` policy INACTIVE |
| `GET /api/v1/backoffice/warranty-policies/:id` | Staff/Admin | — | Detail |
| `PATCH /api/v1/backoffice/warranty-policies/:id` | ADMIN | Mutable fields | Detail |
| `POST /api/v1/backoffice/warranty-policies/:id/activate` | ADMIN | — | ACTIVE |
| `POST /api/v1/backoffice/warranty-policies/:id/deactivate` | ADMIN | `reason` | INACTIVE |
| `POST /api/v1/backoffice/warranty-policies/:id/archive` | ADMIN | `reason` | Archived |

- Fields: unique uppercase `code`, name, defaultDays 0..3650, terms 1..10000 chars.
- Policy đã được OrderItem/Warranty snapshot vẫn sửa/disable được cho sale tương lai; lịch sử không đổi.
- Archive terminal: yêu cầu không còn Product/Variant active tham chiếu, set `status=INACTIVE` + `archivedAt`; không hard-delete/restore.
- Priority số ngày: unit override → variant policy → product policy → StoreSettings; priority điều khoản: variant policy → product policy → StoreSettings default terms.

## 4. Backoffice Warranty

| Method/path | Actor | Success |
|---|---|---|
| `GET /api/v1/backoffice/warranties` | Staff/Admin | Filter/pagination |
| `GET /api/v1/backoffice/warranties/:id` | Staff/Admin | Detail |
| `POST /api/v1/backoffice/warranties/:id/void` | ADMIN | `reason` → VOIDED |

- Warranty phát hành nội bộ trong fulfillment completion, không có manual create endpoint.
- Void yêu cầu ACTIVE, reason 5..500; lưu `voidReason/voidedById/voidedAt` và audit. Expired warranty vẫn có thể void để ghi lịch sử nhưng không thay computed expiry.
- Không restore/delete warranty.

## 5. Backoffice After-sales query/intake

| Method/path | Actor | Request | Success |
|---|---|---|---|
| `GET /api/v1/backoffice/after-sales` | Staff/Admin | Filter/pagination | Case list |
| `GET /api/v1/backoffice/after-sales/:id` | Staff/Admin | — | Case detail |
| `GET /api/v1/backoffice/after-sales/:id/attachments/:attachmentId/url` | Staff/Admin | — | Signed URL <=5 phút |
| `POST /api/v1/backoffice/after-sales/:id/assign` | Staff/Admin | `employeeId?` | Updated detail |
| `POST /api/v1/backoffice/after-sales/:id/receive` | Staff/Admin | `receivedLocationId`, `note?` | RECEIVED |
| `POST /api/v1/backoffice/after-sales/:id/start-inspection` | Staff/Admin | — | INSPECTING detail |
| `POST /api/v1/backoffice/after-sales/:id/record-inspection-summary` | Staff/Admin | `inspectionSummary` | Updated detail |

List filter: `q` request/order/warranty code/customer, type/status/assignedTo/created date, pagination, sort createdAt/updatedAt/requestedAt.

### Receive/start inspection

- Receive only REQUESTED; records server `receivedAt`, location and actor. For iPhone, move unit `SOLD → INSPECTING` and update location atomically.
- Accessory is not added to sellable stock at receive.
- Start inspection only RECEIVED.
- iPhone: create/link DRAFT InventoryInspection type WARRANTY hoặc RETURN and transition case INSPECTING.
- Accessory: transition INSPECTING without InventoryInspection; staff must record `inspectionSummary` 10..2000 before decision.
- iPhone decision requires linked inspection COMPLETED; summary may be derived/supplemented but raw checklist not duplicated.

## 6. Decision commands

| Method/path | Request | Success |
|---|---|---|
| `POST /api/v1/backoffice/after-sales/:id/approve` | `note` | APPROVED |
| `POST /api/v1/backoffice/after-sales/:id/reject` | `reason`, `returnNote?` | REJECTED |

- Both require INSPECTING and inspection context complete.
- Approve note 5..2000, lưu `decisionNote/decidedById/decidedAt`; chưa mutate refund/replacement/inventory outcome.
- Reject reason 5..2000, lưu decision actor/time. Với iPhone đã nhận, command yêu cầu `returnNote` 5..1000, đồng thời xác nhận `returnedAt`, chuyển unit `INSPECTING → SOLD` và audit; không để unit mắc kẹt ở INSPECTING. Accessory có thể omit returnNote nếu không được giữ. Rejection email chạy sau commit.
- Decision audit includes safe summary, not attachment URL/raw checklist.

## 7. Resolution commands

Chỉ case APPROVED được resolve. Mỗi endpoint chạy transaction và chuyển case → RESOLVED.

| Method/path | Request | Invariant/effect |
|---|---|---|
| `POST /api/v1/backoffice/after-sales/:id/resolve-repaired` | `resolutionNote` | iPhone INSPECTING→SOLD khi trả lại; accessory no stock effect |
| `POST /api/v1/backoffice/after-sales/:id/resolve-replaced` | `replacementInventoryUnitId`, `resolutionNote` | iPhone-only; replacement AVAILABLE→SOLD, warranty chuyển unit |
| `POST /api/v1/backoffice/after-sales/:id/resolve-refunded` | `refundId`, `resolutionNote` | Refund phải COMPLETED; warranty void nếu có |
| `POST /api/v1/backoffice/after-sales/:id/resolve-returned-unchanged` | `resolutionNote` | iPhone INSPECTING→SOLD khi trả lại |
| `POST /api/v1/backoffice/after-sales/:id/resolve-other` | `resolutionNote` | ADMIN-only, không tự mutate inventory/payment |

### Repaired/returned unchanged

- Dùng lifecycle context hậu mãi, không tạo StockMovement sale mới và không đổi Order đã completed.
- iPhone trở lại `SOLD` vì vẫn thuộc khách; staff xác nhận đã trả thiết bị trong note/audit.

### Replaced

- P0 chỉ hỗ trợ iPhone replacement. Accessory exchange dùng Refund + Order mới.
- Replacement unit khác unit gốc, AVAILABLE, không reservation và phù hợp product/variant policy do staff xác nhận.
- Serializable transaction set replacement SOLD/soldAt, ghi `replacementInventoryUnitId`, chuyển Warranty.inventoryUnitId sang replacement nhưng giữ original OrderItem và endAt/terms.
- Unit cũ giữ INSPECTING để repair/quarantine/write-off hoặc inspection mới trước AVAILABLE; không tự bán lại.

### Refunded

- Linked Refund thuộc cùng Order, status COMPLETED và amount phù hợp business resolution.
- Case chỉ ghi link; không tự complete Refund.
- Warranty liên quan chuyển VOIDED với reason hậu mãi/refund. iPhone cũ giữ INSPECTING tới xử lý tồn.

## 8. Inventory and warranty invariants

- iPhone nhận lại không AVAILABLE cho tới một current PRE_SALE/RETURN inspection PASSED và make-available command.
- Accessory chỉ tăng sellable stock qua backoffice stock-return sau kiểm tra.
- Warranty unique OrderItem và AfterSales active uniqueness ngăn duplicate case.
- Resolution command lặp trả current case, không double-sell replacement/void warranty/link refund.
- Two staff resolve concurrently: conditional APPROVED→RESOLVED chỉ một command thắng.

## 9. Error contract

- `RESOURCE_NOT_FOUND`: case/warranty/order item không tồn tại hoặc ownership bị che.
- `WARRANTY_NOT_ACTIVE`: warranty void/expired/chưa hiệu lực.
- `AFTER_SALES_REQUEST_ALREADY_OPEN`: OrderItem có case non-terminal.
- `AFTER_SALES_RESOLUTION_REQUIREMENTS_NOT_MET`: thiếu inspection/refund/replacement/note.
- `INVALID_STATE_TRANSITION`: command sai state.
- `INVENTORY_NOT_AVAILABLE`: replacement không còn available hoặc đã reserved.
- Upload errors theo file policy.

## 10. Acceptance test tối thiểu

- Customer/guest chỉ thấy/tạo case cho OrderItem của mình; guest không list.
- Warranty validity dùng snapshot/end exclusive và không đọc policy hiện hành.
- Hai create đồng thời cho một item chỉ một active case.
- Receive iPhone đổi location/lifecycle atomically; accessory không tăng stock.
- Decision thiếu completed inspection/summary bị chặn.
- Reject iPhone atomically trả unit về SOLD và không tạo sale/stock movement mới.
- Replacement race chỉ một case lấy được unit; warranty chuyển đúng nhưng OrderItem history giữ nguyên.
- Refunded resolution yêu cầu completed Refund; không double-refund.
- Attachment private, limit 5 và signed URL authorize đúng owner/role.
- Returned unit không xuất hiện public trước reinspection PASSED + make-available.

## Liên kết

- [Warranty và After-sales requirements](../requirements/warranty-and-aftersales.md)
- [After-sales data dictionary](../data-model/after-sales.md)
- [State machines](../architecture/state-machines.md)
- [Backoffice Catalog/Inventory](backoffice-catalog-inventory-endpoints.md)
- [Backoffice Refund](backoffice-order-fulfillment-refund-endpoints.md)
