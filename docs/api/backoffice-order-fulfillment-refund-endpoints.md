# Backoffice Order, Fulfillment và Refund endpoints

Tài liệu này là contract vận hành P0 sau checkout: xác nhận pickup, chuẩn bị hàng, giao/nhận, theo dõi shipment, hủy đơn và hoàn tiền thủ công.

## 1. Phạm vi và quyền

- Mọi endpoint yêu cầu `EMPLOYEE` hoặc `ADMIN`.
- Mọi success/error response dùng `Cache-Control: no-store`; Bearer sai trả 401 và CUSTOMER/GUEST không fallback vào staff flow.
- Employee được xử lý Order/Payment/Shipment/Refund nhưng mọi action tài chính, hủy, phí ship và deadline override phải có reason/note và AuditLog.
- Backoffice mutation và signed evidence URL giới hạn 120 request/phút/actor; Refund bank upload đồng thời chịu giới hạn 20 request/10 phút/actor. `429` trả error envelope và `Retry-After`.
- Không có generic status PATCH. Mỗi transition là named command với expected-state guard.
- P0 thu số dư bằng `CASH` khi pickup hoặc `COD` khi shipping. Không có bank-transfer balance workflow; deposit shipping vẫn là bank transfer.
- P0 chỉ có một Shipment attempt thực tế. Giao thất bại → nhận hàng hoàn → kiểm định tồn → hủy/refund; redelivery tự động thuộc P1.

## 2. Backoffice Order query

| Method/path | Actor | Success |
|---|---|---|
| `GET /api/v1/backoffice/orders` | Staff/Admin | `200 BackofficeOrderListItemDto[]` + pagination |
| `GET /api/v1/backoffice/orders/:id` | Staff/Admin | `200 BackofficeOrderDetailDto` |
| `PATCH /api/v1/backoffice/orders/:id/internal-note` | Staff/Admin | `internalNote?` → detail DTO |

List query:

```text
q?, status?, fulfillmentStatus?, paymentStatus?, fulfillmentType?,
locationId?, placedFrom?, placedTo?, pickupOverdue?,
page=1, pageSize=20, sortBy=placedAt, sortOrder=desc
```

- `q` tìm exact/prefix orderNumber, customer name/email/phone đã normalize; không tìm raw identifier/evidence.
- Sort allowlist: `placedAt`, `updatedAt`, `grandTotal`, `pickupHoldUntil`.
- Backoffice detail trả snapshot contact/address/items, ba trục status, totals, reservation summary, payment/refund/shipment timeline, pickup deadline và internal note.
- Không trả raw device identifier; staff dùng reveal endpoint inventory có audit.

### Giá vốn hiện tại trong đơn hàng — bổ sung 13/10/2026

- Hai GET list/detail bổ sung `currentCostSummary` **chỉ cho ADMIN**: `source: CURRENT_INVENTORY`, `knownCost`, `totalCost` nullable và `missingQuantity`. Detail còn có `items[].currentCost` gồm `inventoryUnitId`, `acquisitionCost`, `additionalCost`, `unitCost`, `lineCost`.
- Nguồn là hồ sơ máy hiện tại, theo lựa chọn của người dùng; không phải snapshot giá vốn lúc bán. Áp dụng cả đơn đã hoàn tất/hủy và đơn đại lý trong danh sách vận hành. Thay chi phí máy thì lần đọc đơn sau phản ánh giá vốn mới.
- Tổng dùng `(acquisitionCost + additionalCost) × quantity` bằng số nguyên. Thiếu giá nhập hoặc không có máy liên kết (kể cả phụ kiện chưa theo dõi vốn) thì giá vốn dòng là null, cộng số lượng thiếu; tổng đơn là null nếu còn thiếu. `knownCost` chỉ cộng các dòng đủ dữ liệu; giá nhập đã ghi bằng 0 vẫn hợp lệ.
- Không truy vấn giá vốn cho EMPLOYEE; response bỏ hẳn các trường này. Giữ `no-store`, quyền staff và pagination hiện có. Reader đọc batch cho các order ID trong trang, không gọi API giá vốn riêng cho từng dòng.
- Mutation response tiếp tục projection vận hành cũ; giao diện đã refetch GET detail sau thao tác để lấy số liệu mới. Không thêm endpoint, schema migration hoặc thay tổng tiền khách phải trả.

## 3. Order preparation và Pickup workflow

| Method/path | Request | Success |
|---|---|---|
| `POST /api/v1/backoffice/orders/:id/confirm` | — | Pickup `PLACED → CONFIRMED` |
| `POST /api/v1/backoffice/orders/:id/start-preparing` | — | Order `CONFIRMED → PROCESSING`, fulfillment `PENDING → PREPARING` |
| `POST /api/v1/backoffice/orders/:id/mark-pickup-ready` | — | Fulfillment `PREPARING → READY` |
| `POST /api/v1/backoffice/orders/:id/extend-pickup-hold` | `holdUntil`, `reason` | Updated deadline/reservation |
| `POST /api/v1/backoffice/orders/:id/complete-pickup` | `confirmCashCollected` | `200 BackofficeOrderDetailDto` |

### Confirm/start/ready

- `confirm` chỉ dành cho PICKUP `PLACED`, active pickup reservation chưa hết hạn. Shipping được confirm bằng verify deposit hoặc tự confirm nếu deposit = 0.
- `start-preparing` yêu cầu Order CONFIRMED, fulfillment PENDING và reservation active.
- `mark-pickup-ready` yêu cầu PROCESSING/PREPARING, ghi `pickupReadyAt`; reservation vẫn giữ tới completion/cancel/expiry.

### Extend hold

- Chỉ pickup chưa terminal/in-transit, reservation ACTIVE và deadline hiện tại chưa hết.
- `holdUntil` phải lớn hơn deadline hiện tại và không quá `now + 7 ngày`; reason 5..500 ký tự.
- Update `Order.pickupHoldUntil` và mọi pickup reservation expiry trong một transaction, audit before/after.
- Không hồi sinh reservation/order đã expired/cancelled.

### Complete pickup

- Nếu `balanceDue > 0`, `confirmCashCollected` bắt buộc `true`; backend atomically tạo+verify một `FULL_PAYMENT/CASH` đúng bằng balance.
- Nếu `balanceDue = 0`, field phải omit/false và không tạo Payment 0 đồng.
- Completion transaction consume inventory/reservation/voucher, phát hành Warranty và complete Order/Fulfillment đúng [Fulfillment transactions](../architecture/fulfillment-transactions.md).
- Command lặp trả current completed projection, không tạo payment/movement/warranty lần hai.

## 4. Shipping fee override

| Method/path | Request | Success |
|---|---|---|
| `POST /api/v1/backoffice/orders/:id/override-shipping-fee` | `shippingFee`, `reason` | Updated pricing/payment projection |

- Chỉ SHIPPING Order `PLACED`, deposit Payment còn `AWAITING_PROOF`, chưa submit/verify bất kỳ payment và fulfillment PENDING.
- `shippingFee >= 0`; reason 5..500.
- Transaction cập nhật `shippingFee`, last override actor/time/reason, `grandTotal` và `balanceDue`.
- `depositRequired = min(depositRequired hiện tại, grandTotal mới)`: override không tăng khoản cọc khách đã được yêu cầu; chỉ giảm nếu tổng mới thấp hơn cọc cũ.
- Payment deposit `expectedAmount` cập nhật theo deposit mới; transferContent/deadline không đổi. Nếu deposit mới = 0, cancel Payment awaiting proof, confirm Order và chuyển reservation sang FULFILLMENT.
- Không override sau khi proof đã submit/verified; xử lý sai lệch sau đó dùng refund/manual business flow, không sửa lịch sử total âm thầm.
- Email pricing update chạy sau commit.

## 5. Shipping/Shipment workflow

| Method/path | Request | Success |
|---|---|---|
| `POST /api/v1/backoffice/orders/:id/shipment` | `carrierName`, `trackingCode`, `trackingUrl?` | `201 ShipmentDto` CREATED |
| `POST /api/v1/backoffice/shipments/:id/hand-over` | — | Shipment handed over, inventory consumed |
| `POST /api/v1/backoffice/shipments/:id/mark-delivered` | `confirmCodCollected` | Delivered + Order complete |
| `POST /api/v1/backoffice/shipments/:id/mark-failed` | `reason` | Delivery FAILED |
| `POST /api/v1/backoffice/shipments/:id/mark-returned` | `returnedToLocationId`, `reason` | Goods physically RETURNED |

### Create shipment

- Shipping dùng shared `POST /api/v1/backoffice/orders/:id/start-preparing` ở pickup workflow để chuyển CONFIRMED/PENDING sang PROCESSING/PREPARING trước khi tạo shipment.
- Order SHIPPING, PROCESSING/PREPARING, chưa có active/terminal shipment attempt trong P0.
- Carrier/tracking code trim, không rỗng; tracking URL optional `https`.
- `attemptNumber = 1`; unique `(orderId, attemptNumber)`. P0 không tạo attempt 2.
- Tracking được public trong customer Order detail.

### Hand over

- Require CREATED shipment, active reservation và tracking data.
- Serializable transaction consume reservation; iPhone AVAILABLE→IN_TRANSIT; accessory giảm onHand/reserved và append SALE movement; fulfillment → IN_TRANSIT.
- Không thu COD, phát Warranty hoặc complete Order ở bước này.

### Delivered

- Require HANDED_TO_CARRIER và fulfillment IN_TRANSIT.
- Nếu `balanceDue > 0`, `confirmCodCollected=true` bắt buộc; backend atomically tạo+verify `BALANCE/COD` đúng bằng balance.
- Nếu balance 0, không tạo Payment và confirmation flag phải omit/false.
- Transaction chuyển Shipment DELIVERED, fulfillment COMPLETED, iPhone SOLD, consume voucher, phát Warranty và complete Order.

### Failed/returned

- `mark-failed`: HANDED_TO_CARRIER → FAILED, fulfillment → FAILED; reason bắt buộc; chưa nhập tồn.
- `mark-returned`: require FAILED và hàng đã thực nhận; lưu `returnedToLocationId/returnNote/returnedAt`, Shipment → RETURNED, fulfillment → RETURNED.
- iPhone đổi location về `returnedToLocationId` rồi IN_TRANSIT→INSPECTING; staff tạo RETURN inspection mới.
- Accessory không tự tăng StockLevel; sau kiểm tra staff gọi stock return command với reference Shipment/Order.
- Sau RETURNED, staff hủy Order; cancellation tạo Refund nếu có tiền đã verify. Không redelivery trong P0.

## 6. Backoffice cancellation

| Method/path | operationId | Request | Success |
|---|---|---|---|
| `POST /api/v1/backoffice/orders/:id/cancel` | `cancelBackofficeOrder` | `{ reason }` | `200 BackofficeOrderDetailDto` |

- Reason trim 5..500; staff có thể hủy PLACED/CONFIRMED/PROCESSING khi fulfillment còn PENDING/PREPARING/READY, hoặc hủy SHIPPING Order sau khi fulfillment RETURNED.
- Payment UNDER_REVIEW phải reject bằng payment command thay vì bypass bằng cancel.
- Không hủy Order COMPLETED hoặc fulfillment IN_TRANSIT/FAILED/COMPLETED. Customer/guest tiếp tục bị giới hạn ở pre-handover flow của owned Order.
- Transaction cancel Order/Fulfillment, chuyển Shipment CREATED (nếu có) → CANCELLED, terminalize awaiting payment, release active reservation/voucher và tạo đúng một Refund REQUESTED cho verified amount chưa được REQUESTED/PROCESSING/COMPLETED Refund cover.
- Nhánh RETURNED không restock accessory, không đổi reservation CONSUMED và giữ returned iPhone ở INSPECTING.
- Order đã CANCELLED là replay: trả projection hiện hành, không rewrite reason, release/refund, audit hoặc notification.

## 7. Refund query/create

| Method/path | operationId | Request | Success |
|---|---|---|---|
| `GET /api/v1/backoffice/refunds` | `listBackofficeRefunds` | Filter/pagination | Paginated `RefundListItemDto` |
| `GET /api/v1/backoffice/refunds/:id` | `getBackofficeRefund` | — | `200 RefundDetailDto` |
| `POST /api/v1/backoffice/orders/:id/refunds` | `createRefund` | `{ paymentId?, amount, method, reason }` | `201 RefundDetailDto` REQUESTED |

List filter: `status`, `method`, `orderNumber`, `createdFrom/to`, `page/pageSize`, sort `createdAt|amount|processingAt`. API default `createdAt desc, id desc`; mọi sort thêm `id` làm tie-breaker và `processingAt` null cuối. `orderNumber` được trim/uppercase và tìm exact/prefix.

- Cancellation tự tạo Refund BANK_TRANSFER khi tiền nguồn là shipping deposit.
- Manual create chỉ khi Order CANCELLED hoặc COMPLETED và có verified payment chưa được completed/active refund cover.
- Optional `paymentId` phải là VERIFIED Payment thuộc cùng Order; method là kênh hoàn tiền và không bắt buộc giống Payment nguồn.
- Serializable transaction tính available refundable amount từ Refund REQUESTED/PROCESSING/COMPLETED; client amount > available trả `REFUND_AMOUNT_EXCEEDS_PAID`.
- `amount` là positive VND digit string; `reason` trim 5..500. Request P0 chỉ nhận method `BANK_TRANSFER` hoặc `CASH`.
- `RefundMethod.OTHER` được giữ để đọc dữ liệu legacy. Record OTHER/REQUESTED chỉ được reject/cancel, không được start hoặc complete.
- Mỗi POST manual create thành công là một obligation mới; không dedupe theo payload vì hai partial Refund giống nhau có thể hợp lệ. Aggregate lock bảo vệ không over-refund.

## 8. Refund processing commands

| Method/path | operationId | Content/request | Success |
|---|---|---|---|
| `POST /api/v1/backoffice/refunds/:id/start-processing` | `startRefundProcessing` | JSON `{ note? }` | `200 RefundDetailDto` PROCESSING |
| `POST /api/v1/backoffice/refunds/:id/complete-bank-transfer` | `completeBankTransferRefund` | Multipart `{ file, note }` | `200 RefundDetailDto` COMPLETED |
| `POST /api/v1/backoffice/refunds/:id/complete-cash` | `completeCashRefund` | JSON `{ note }` | `200 RefundDetailDto` COMPLETED |
| `POST /api/v1/backoffice/refunds/:id/reject` | `rejectRefund` | JSON `{ reason }` | `200 RefundDetailDto` REJECTED |
| `POST /api/v1/backoffice/refunds/:id/cancel` | `cancelRefund` | JSON `{ reason }` | `200 RefundDetailDto` CANCELLED |
| `GET /api/v1/backoffice/refunds/:id/evidence-url` | `getRefundEvidenceUrl` | — | Signed read URL tối đa 300 giây |

- Start chỉ từ REQUESTED BANK_TRANSFER/CASH; gắn processor/time, amount/method/reason/relations trở thành immutable. Optional note trim 5..500.
- EMPLOYEE chỉ complete Refund mình đã start; ADMIN có thể break-glass complete nhưng không overwrite original `processedById`. Audit ghi actor thực hiện completion.
- Bank complete yêu cầu đúng một evidence JPEG/PNG/WebP/PDF <=10 MiB và note 5..500. Backend validate magic bytes/MIME, lưu size + lowercase SHA-256 và upload private object trước completion transaction.
- Cash complete yêu cầu method CASH và note 5..500; request là JSON và Refund CASH tuyệt đối không có evidence.
- Completion recheck tổng refund, lưu evidence khi có, cập nhật Order.refundedAmount/paymentStatus và audit atomically.
- Completion note thay optional start note và là operational note cuối. Completion không đổi Order status hoặc mở lại `balanceDue`.
- Reject/cancel chỉ từ REQUESTED; PROCESSING chỉ có thể complete sau khi đã kiểm tra đủ điều kiện. Reason bắt buộc và lưu `terminalReason/terminalById/terminalAt`, không overwrite business `reason`. Mọi terminal Refund immutable.
- Exact start/reject/cancel replay yêu cầu cùng actor và normalized payload. Bank completion replay yêu cầu cùng evidence SHA-256 và normalized note; payload khác conflict và không overwrite evidence.
- Evidence URL chỉ staff/admin, authorize/audit mỗi lần, TTL thực tế `min(config, 300 giây)`; URL/path/digest không log, lưu response DTO hoặc public Order projection.

## 9. DTO và errors

`Payment/Refund/Shipment` backoffice DTO có amounts, state/timeline, safe actor summary và evidence presence; object path/digest không xuất hiện trong DTO, signed URL chỉ xuất hiện qua endpoint read riêng. `BackofficeOrderDetailDto` không serialize Prisma model trực tiếp.

- `RefundListItemDto`: Order number, amount, method, status, requester type/safe actor, timestamps và `evidenceAvailable`.
- `RefundDetailDto`: safe Payment source, reason, operational note, processor/terminal actor, terminal reason và backend-authoritative `availableActions`.
- Public `OrderRefundDto`: amount, method, status, business/terminal reason và timeline; không có internal actor/note/evidence metadata.
- Backoffice Order detail có `refundableAmount`; `CANCEL_ORDER` và `CREATE_REFUND` chỉ xuất hiện khi policy cho phép.
- Refund actions: REQUESTED cho start/reject/cancel; PROCESSING cho đúng completion method; COMPLETED/BANK_TRANSFER cho evidence read.

Lỗi chính:

- `RESOURCE_NOT_FOUND`: backoffice resource không tồn tại.
- `INVALID_STATE_TRANSITION`: command sai state/guard.
- `PAYMENT_ALREADY_REVIEWED`: payment terminal.
- `ORDER_NOT_FULLY_PAID`: completion chưa thu đủ balance.
- `REFUND_AMOUNT_EXCEEDS_PAID`: refund obligation vượt tiền verified còn lại.
- `EVIDENCE_REQUIRED`/`EVIDENCE_INVALID`: bank refund thiếu/sai proof.
- `INVENTORY_NOT_AVAILABLE`: reservation/counter/location không hợp lệ.
- `CONCURRENT_MODIFICATION`: retry Serializable đã hết.

## 10. Acceptance test tối thiểu

- Pickup confirm/start/ready/extend/complete đúng guard; cash payment chỉ tạo một lần.
- Shipping fee override chỉ trước proof, recompute total/payment/deposit đúng và audit.
- Shipment handover consume inventory đúng một lần; delivered không trừ phụ kiện lần hai.
- COD/cash amount luôn bằng balance backend, client không truyền amount.
- Failed chưa nhập tồn; returned iPhone đi INSPECTING, accessory cần stock-return command.
- Không tạo attempt giao lần hai trong P0.
- Staff cancel/reject cạnh tranh không double release/voucher/refund.
- Manual refund và hai completion đồng thời không vượt verified payment.
- Bank refund storage fail/DB fail không đánh dấu COMPLETED; orphan xử lý theo policy.
- Customer projection không lộ internal note/evidence path/refund actor nội bộ.

## Liên kết

- [Fulfillment transactions](../architecture/fulfillment-transactions.md)
- [Order cancellation và Refund](../architecture/order-cancellation-and-refund.md)
- [Refund processing](../architecture/refund-processing.md)
- [Payment proof và review](payment-proof-and-review-endpoints.md)
- [Sales data dictionary](../data-model/sales.md)
