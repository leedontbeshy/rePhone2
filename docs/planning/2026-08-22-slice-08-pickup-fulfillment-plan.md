# Kế hoạch triển khai Slice 08 — Pickup Fulfillment

> Trạng thái: ✅ COMPLETE — đã triển khai, kiểm thử và rollout Supabase ngày 2026-08-23.<br>
> Baseline: Slice 07 đã hoàn thành với 87 OpenAPI operation; Slice 08 thêm đúng 8 operation, mục tiêu 95.<br>
> Không sửa `docs/decisions`; behavior hiện hành theo precedence tại [docs index](../readme.md#nguồn-sự-thật-khi-có-trùng-nội-dung).

## 1. Mục tiêu và Definition of Done

Triển khai trọn vòng đời pickup thủ công từ Order `PLACED`/Fulfillment `PENDING` đến `COMPLETED`, thu CASH nếu còn balance và giữ payment/inventory/voucher/warranty/order nhất quán. Slice hoàn thành khi:

- EMPLOYEE/ADMIN có Backoffice Order list/detail/internal-note và confirm, start preparing, mark ready, extend hold, complete pickup qua năm named command.
- Complete pickup chạy trong một `Serializable` transaction, tính lại projection tiền từ database và chỉ tạo+verify `FULL_PAYMENT/CASH` bằng balance authoritative khi balance dương.
- Reservation, tồn kho, VoucherUsage, Warranty, fulfillment và Order cùng commit hoặc cùng rollback; replay/concurrency không tạo effect trùng.
- Pickup quá deadline bị expire idempotently bởi system command/job: Order/Fulfillment cancel, reservation `EXPIRED`, tồn/voucher được release đúng một lần.
- Customer/guest Order detail phản ánh deadline, ready/completed timestamps, payment và warranty projection mà không lộ field nội bộ.
- OpenAPI tăng từ 87 lên đúng 95 operation, generated client không drift; migration-from-zero, seed hai lần và `pnpm verify` xanh.
- Happy path pickup và expiry/cancel failure path có invariant query sau commit.

Không thuộc Slice 08:

- Shipping fee override, Shipment, handover, tracking, COD, failed/returned và redelivery; thuộc Slice 09/P1 tương ứng.
- Backoffice cancellation/refund processing/evidence; thuộc Slice 10. Slice 08 chỉ tái dùng cancellation/refund primitive hiện có khi expiry cần tạo obligation.
- Warranty/customer after-sales API, policy CRUD, void/case workflow; thuộc Slice 11. Slice 08 chỉ xây internal warranty issuer bắt buộc cho terminal fulfillment.
- Full `pnpm demo:scenarios` suite, dashboard/statistics và visual polish rộng, settings/audit utility UI, Redis/queue/outbox, multi-replica scheduler, payment gateway, carrier API hoặc bank-transfer balance.

## 2. Quyết định đã khóa

1. **Đúng 8 HTTP operation.** Ba Backoffice Order list/detail/internal-note operation và năm pickup command thuộc Slice 08; tổng OpenAPI sau slice là 95.
2. **Fulfillment là orchestrator.** `FulfillmentModule` sở hữu use case/transaction boundary; Orders, Payments, Inventory, Vouchers và Warranty cung cấp gateway/port nhận cùng Prisma transaction client. Không `forwardRef`, nested transaction hoặc controller gọi Prisma.
3. **Warranty issuer được dựng ngay trong Slice 08.** Issuer là internal service, dùng snapshot trên OrderItem; Slice 11 mở rộng query/policy/after-sales mà không di chuyển transaction boundary.
4. **Pickup expiry thuộc Slice 08.** `expirePickupHolds` được nối vào SchedulerModule hiện có vì expiry/cancel là một phần Definition of Done, dù job hardening tổng thể tiếp tục ở Slice 12.
5. **Deadline authoritative trên Order, đồng bộ xuống reservation.** `Order.pickupHoldUntil` dùng cho query/job và mọi command recheck; mỗi active pickup reservation phải có cùng `expiresAt`. Extend cập nhật cả hai trong một transaction.
6. **Boundary deadline:** pickup hợp lệ khi `now < pickupHoldUntil`; tại `now >= pickupHoldUntil` chỉ expiry/cancellation được phép. Confirm/start/ready/complete/extend đều recheck deadline trong transaction.
7. **Pickup reservation giữ `holdReason=PICKUP`.** Không đổi sang `FULFILLMENT`; completion chuyển `ACTIVE → CONSUMED`, pickup timeout chuyển `ACTIVE → EXPIRED`, customer/staff cancellation thông thường dùng `RELEASED`.
8. **Replay theo đúng trạng thái đích.** Confirm/start/ready trả projection hiện tại khi resource đang ở chính state vừa đạt; state đã đi xa hơn hoặc sang nhánh khác trả conflict. Extend cùng deadline hiện tại là replay; deadline nhỏ hơn hiện tại bị reject. Complete trên projection đã hoàn tất trả projection hiện tại và không gửi lại effect; expiry trên state terminal là no-op.
9. **CASH không nhận amount từ client.** Nếu `balanceDue > 0`, request chỉ xác nhận `confirmCashCollected=true`; Payment có `expectedAmount=receivedAmount=balance`, `FULL_PAYMENT/CASH/VERIFIED`, reviewer/time là actor/time completion. Balance 0 không tạo Payment.
10. **Effect “một lần” tính theo target.** Tối đa một pickup CASH Payment/order; một SALE StockMovement/accessory reservation; một Warranty/OrderItem đủ điều kiện. Một order nhiều line có thể có nhiều movement/warranty record.
11. **Không gửi provider trong transaction.** Audit nằm trong commit; `pickup.ready`, `order.completed`, `order.cancelled` gửi best-effort sau transition mới. SMTP fail không rollback.
12. **UI đủ vận hành pickup.** Dựng Backoffice Order queue/detail/internal-note/five actions và cập nhật customer Order projection; smoke dùng fixture `pickup-ready` tạo qua application commands. Không dựng permanent scenario framework hoặc dashboard ngoài pickup trong slice này.

### Giả định triển khai

- Baseline Slice 07 với 87 OpenAPI operation và toàn bộ regression gate đang xanh trước khi merge Slice 08.
- P0 vận hành một STORE pickup location và đúng một API scheduler replica; multi-location policy và distributed job coordination chưa thuộc slice.
- Checkout Slice 06 đã tạo Order snapshot, `pickupHoldUntil` và reservation hợp lệ; Slice 08 không tính lại commercial snapshot từ catalog/settings hiện hành.
- OrderItem đã giữ warranty snapshot cần thiết để issuer nội bộ không phụ thuộc policy mutable.
- Pickup expiry tái dùng cancellation/refund primitive đã có; clock, public-code generator và job run ID đều inject được để test deterministic.

## 3. Kiến trúc và interface

```text
FulfillmentModule
  ├── AuthModule
  ├── AuditModule
  ├── OrderTransactionPortsModule
  ├── PaymentCoreModule
  ├── InventoryModule
  ├── VouchersModule
  ├── WarrantyModule          (internal issuer only)
  └── NotificationsModule

SchedulerModule
  └── FulfillmentModule      (expirePickupHolds application command)
```

- `FulfillmentController` chỉ validate UUID/body, enforce access-token role và gọi command service.
- `PickupFulfillmentService` sở hữu confirm/start/ready/extend/complete/expire policy và transaction orchestration.
- `FulfillmentRepository` lock/load Order root, query expired candidate IDs và build backoffice projection; repository không gửi mail.
- `PaymentCoreModule` export fulfillment-payment gateway để recompute projection và create verified CASH bằng cùng transaction.
- `InventoryModule` export fulfillment-inventory gateway để lock target theo ID, validate location/hold, consume hoặc expire reservation và append SALE movement.
- `VouchersModule` bổ sung consume gateway; release hiện có tiếp tục phục vụ expiry/cancel.
- `WarrantyModule` export issuer tạo warranty từ OrderItem snapshot. Mã warranty dùng public-code generator inject được; test dùng deterministic generator.
- `OrderTransactionPortsModule` export order lock/projection/cancellation primitive cần thiết nhưng không phụ thuộc ngược Fulfillment.
- Lock order thống nhất: Order → Payment theo ID → InventoryReservation/InventoryUnit/StockLevel theo ID đã sort → Voucher → Warranty business key. Retry bao quanh toàn callback.

### API — đúng 8 operation

| Method/path | operationId | Request | Success |
|---|---|---|---|
| `GET /api/v1/backoffice/orders` | `listBackofficeOrders` | Filter/pagination | `200 BackofficeOrderListItemDto[]` + pagination |
| `GET /api/v1/backoffice/orders/:id` | `getBackofficeOrder` | — | `200 BackofficeOrderDetailDto` |
| `PATCH /api/v1/backoffice/orders/:id/internal-note` | `updateBackofficeOrderInternalNote` | `{ internalNote }` | `200 BackofficeOrderDetailDto` |
| `POST /api/v1/backoffice/orders/:id/confirm` | `confirmPickupOrder` | — | `200 BackofficeOrderDetailDto` |
| `POST /api/v1/backoffice/orders/:id/start-preparing` | `startPreparingOrder` | — | `200 BackofficeOrderDetailDto` |
| `POST /api/v1/backoffice/orders/:id/mark-pickup-ready` | `markPickupReady` | — | `200 BackofficeOrderDetailDto` |
| `POST /api/v1/backoffice/orders/:id/extend-pickup-hold` | `extendPickupHold` | `{ holdUntil, reason }` | `200 BackofficeOrderDetailDto` |
| `POST /api/v1/backoffice/orders/:id/complete-pickup` | `completePickup` | `{ confirmCashCollected? }` | `200 BackofficeOrderDetailDto` |

Tất cả tám operation:

- Require authenticated `EMPLOYEE` hoặc `ADMIN`; CUSTOMER/GUEST/anonymous không vào backoffice.
- Path `id` là UUID Order nội bộ. Không nhận order status, amount, location, actor hoặc timestamp authoritative từ client.
- Dùng access-token security, response envelope `{ data }`, Money digit string và Instant ISO-8601 UTC.
- Error chính: `VALIDATION_FAILED`, `AUTH_REQUIRED`, `ACCESS_TOKEN_INVALID`, `FORBIDDEN`, `RESOURCE_NOT_FOUND`, `INVALID_STATE_TRANSITION`, `RESERVATION_EXPIRED`, `INVENTORY_NOT_AVAILABLE`, `ORDER_NOT_FULLY_PAID`, `CONCURRENT_MODIFICATION`.

List query khóa theo contract:

```text
q?, status?, fulfillmentStatus?, paymentStatus?, fulfillmentType?,
locationId?, placedFrom?, placedTo?, pickupOverdue?,
page=1, pageSize=20, sortBy=placedAt, sortOrder=desc
```

- `q` chỉ tìm orderNumber exact/prefix và normalized customer name/email/phone; không tìm raw identifier, internal note hoặc evidence.
- Sort allowlist: `placedAt`, `updatedAt`, `grandTotal`, `pickupHoldUntil`; tie-breaker `id` ổn định.
- `pickupOverdue` dùng injected `now`, pickup chưa terminal và `pickupHoldUntil <= now`; query không tự mutate/expire Order.
- Internal note nhận string đã trim hoặc `null` để clear, chỉ staff/admin, audit thay đổi before/after; không xuất hiện trong customer projection, search hoặc notification.

`BackofficeOrderDetailDto` của slice bao phủ tối thiểu:

```text
id, orderNumber
status, fulfillmentStatus, paymentStatus, fulfillmentType
contact snapshot, items[] snapshot
pricing { subtotal, discounts, shippingFee, grandTotal, depositRequired,
          paidAmount, refundedAmount, balanceDue }
pickup { location { id, code, name }, holdUntil, readyAt?, pickedUpAt? }
reservations[] { id, orderItemId, targetType, quantity, status, holdReason, expiresAt? }
payments[] safe summary
warranties[] { warrantyCode, orderItemId, startAt, endAt, status }
placedAt, confirmedAt?, completedAt?, cancelledAt?
availableActions[]
```

Backoffice detail được phép trả `internalNote`; storefront/customer projection tuyệt đối không trả field này. Không serialize Prisma model trực tiếp hoặc trả cost, raw device identifier, guest token/hash, private object path hay raw audit metadata.

## 4. State, guard và data flow

### Confirm pickup

1. Lock Order; require `PICKUP`, Order `PLACED`, fulfillment `PENDING`.
2. Require STORE pickup location bằng fulfillment location; tất cả reservation `ACTIVE/PICKUP`, đúng location và `expiresAt = pickupHoldUntil > now`.
3. Conditional transition Order `PLACED → CONFIRMED`, set `confirmedAt=now`; fulfillment/reservation/tồn không đổi.
4. Audit `fulfillment.pickup_confirmed`; không gửi email riêng.

### Start preparing

1. Require Order `CONFIRMED`, fulfillment `PENDING`, active reservation và deadline hợp lệ.
2. Conditional transition Order `CONFIRMED → PROCESSING`, fulfillment `PENDING → PREPARING`.
3. Không consume reservation, không trừ onHand và không tạo movement/payment/warranty.
4. Route được enable cho cả PICKUP và SHIPPING đã `CONFIRMED/PENDING`; các command shipment tiếp theo vẫn thuộc Slice 09. Deadline pickup chỉ áp dụng cho nhánh PICKUP.

### Mark pickup ready

1. Require PICKUP Order `PROCESSING`, fulfillment `PREPARING`, active valid hold.
2. Fulfillment `PREPARING → READY`, set `pickupReadyAt=now`; inventory vẫn giữ bởi reservation.
3. Audit `fulfillment.pickup_ready`; emit `pickup.ready` một lần sau commit với store/address và deadline snapshot.

### Extend pickup hold

1. Normalize `reason`; require 5..500 characters. Parse `holdUntil` Instant.
2. Require PICKUP chưa terminal, active reservation, current deadline `> now`.
3. Deadline bằng deadline hiện tại là replay; deadline mới hợp lệ phải `> current pickupHoldUntil` và `<= now + 7 days`.
4. Atomically update Order deadline và mọi active `PICKUP` reservation expiry; affected reservation count phải bằng full active set.
5. Audit `fulfillment.pickup_hold_extended` với before/after đã redacted; không hồi sinh expired/cancelled record và không gửi email P0.

### Complete pickup

Một `Serializable` transaction dùng một injected completion instant:

1. Lock/load Order graph; nếu Order/Fulfillment đã `COMPLETED`, return replay projection và không tạo/gửi effect mới.
2. Require PICKUP Order `PROCESSING`, fulfillment `READY`, đúng STORE/location, deadline còn hiệu lực và mọi reservation `ACTIVE/PICKUP` đồng bộ.
3. Lock Payment attempts, recompute `paidAmount`, `refundedAmount`, `balanceDue`, `paymentStatus` từ database.
4. Nếu balance dương, require `confirmCashCollected=true`, create+verify `FULL_PAYMENT/CASH` đúng balance. Nếu balance zero, require field omit/false và không tạo Payment.
5. Require resulting payment summary `PAID`; client không thể chọn payment amount/method/purpose.
6. Consume từng reservation đúng một lần:
   - iPhone: reservation `CONSUMED`, InventoryUnit `AVAILABLE → SOLD`, set `soldAt=completionAt`.
   - Accessory: atomically giảm `quantityOnHand` và `quantityReserved`, append một `SALE` StockMovement theo reservation/order, reservation `CONSUMED`.
7. VoucherUsage `RESERVED → CONSUMED` nếu có.
8. Với mỗi OrderItem `warrantyDaysSnapshot > 0`, create Warranty unique/orderItem; `startAt=completionAt`, `endAt=startAt + daysSnapshot × 24 giờ`, terms từ snapshot, customer null cho guest.
9. Fulfillment `READY → COMPLETED`, set `pickedUpAt=completionAt`; Order `PROCESSING → COMPLETED`, set `completedAt=completionAt` và projection payment mới.
10. Audit `fulfillment.pickup_completed`; commit rồi emit `order.completed`. Bất kỳ lỗi nào ở bước 3–10 rollback toàn bộ.

### Expire pickup

- Candidate: `fulfillmentType=PICKUP`, Order `PLACED|CONFIRMED|PROCESSING`, fulfillment `PENDING|PREPARING|READY`, `pickupHoldUntil <= now`.
- Mỗi candidate chạy một system command/Serializable transaction, lock và recheck state/deadline.
- Order/Fulfillment → `CANCELLED`, set reason/timestamp; reservation `ACTIVE → EXPIRED` và release accessory reserved counter; VoucherUsage `RESERVED → RELEASED`.
- Terminalize payment phù hợp và dùng cancellation finance primitive để tạo tối đa một Refund `REQUESTED` nếu verified money chưa được cover. Trạng thái này là defensive P0; checkout pickup bình thường không có payment trước completion.
- Audit actor `SYSTEM`, action `fulfillment.pickup_expired`, request ID `job:expirePickupHolds:<runUuid>`; emit `order.cancelled` sau commit.
- Job chạy mỗi phút UTC, batch `SCHEDULER_BATCH_SIZE`, process-local mutex; một row lỗi không rollback batch. `SCHEDULER_ENABLED=false` trong test process thông thường.

## 5. Database, migration và idempotency

Forward migration Slice 08 phải có preflight trước deploy và không sửa migration đã chia sẻ:

- Strengthen pickup lifecycle checks: READY cần `pickupReadyAt`; completed pickup cần `pickedUpAt/completedAt`, fulfillment/order/payment state tương ứng; SHIPPING tiếp tục không có pickup fields.
- Index candidate expiry theo `fulfillmentType`, `status`, `pickupHoldUntil`, `id` hoặc partial equivalent đã chứng minh bằng query plan.
- Partial unique business key bảo đảm tối đa một pickup `FULL_PAYMENT/CASH` Payment/order.
- SALE movement dùng stable reference tới Order/reservation; partial unique business key bảo đảm tối đa một movement/accessory reservation. Không áp constraint làm hỏng receipt/transfer/adjustment hiện có.
- Giữ/kiểm chứng Warranty unique `orderItemId`, warranty code unique và interval constraint; không thêm manual issuance endpoint.
- Payment VERIFIED CASH phải có positive amount, `expectedAmount=receivedAmount`, reviewer/time; không có bank/proof fields.
- Reservation deadline/status/timestamp, VoucherUsage status/timestamp và Order money constraints phải tiếp tục pass migration-from-zero.

Preflight dừng rollout nếu có pickup row sai type/location/deadline, active reservation lệch Order deadline/reason/location, duplicate pickup cash/movement business key, completed pickup thiếu timestamps/payment/inventory hoặc Warranty trùng/malformed. Không auto-repair operational row trong migration.

Idempotency dựa cả application guard và database defense-in-depth:

- Complete replay đọc projection đã commit trước khi validate confirmation flag mới.
- Hai complete cạnh tranh chỉ một Order conditional transition thắng; loser đọc lại completed projection sau bounded retry/conflict handling.
- Inventory/Voucher terminal update chỉ tác động từ source status expected.
- Warranty unique/orderItem, cash unique/order và movement business key bảo vệ effect nếu callback được retry.
- Expiry/cancel/complete cạnh tranh cho đúng một terminal outcome; không có trạng thái lai.

## 6. Security, audit, notifications và UI

- Backoffice guard xác thực account ACTIVE và role EMPLOYEE/ADMIN; frontend role gate chỉ là UX.
- DTO whitelist/reject unknown field; bodyless command không chấp nhận JSON status/amount. Backoffice mutation dùng Bearer access token, không fallback guest credential.
- Dùng backoffice rate-limit baseline hiện có; log route template/request ID/actor/resource/state, không log contact body, token, raw identifier hoặc full payment data.
- Audit nằm trong transaction và chứa actor, request ID, safe before/after/reason. Exact action names của slice: `order.internal_note_updated`, `fulfillment.pickup_confirmed`, `fulfillment.preparation_started`, `fulfillment.pickup_ready`, `fulfillment.pickup_hold_extended`, `fulfillment.pickup_completed`, `fulfillment.pickup_expired`.
- Notification chỉ phát khi transition mới commit. Replay không gửi lại. Provider fail được log redacted và không đổi HTTP/business success.
- `/backoffice/orders` cung cấp queue có search/filter/pagination/sort đã khóa, badge ba trục status và tín hiệu pickup overdue; filter state nằm trên URL để reload/share được.
- `/backoffice/orders/[id]` hiển thị safe detail, internal note và đúng năm action theo `availableActions`; extend yêu cầu deadline/reason, complete yêu cầu xác nhận thu CASH khi balance dương.
- Mutation UI disable khi submit, chống double-click, hiển thị field/server error an toàn và refetch detail/list sau success hoặc conflict. Role gate frontend là UX; API vẫn là authorization boundary.
- Existing `/orders/[orderNumber]` hiển thị ba trục status, pickup hold/ready/picked-up, authoritative payment summary/attempt và warranty code/interval sau completion. Guest access tiếp tục qua order-scoped credential; không lộ backoffice DTO.
- Backoffice queue/detail và customer detail phải có loading/empty/error/access-denied states, keyboard-visible focus và layout usable trên viewport mobile. Smoke/manual demo dựng `pickup-ready` fixture qua checkout → confirm → start → ready application commands; permanent `demo:scenarios`, dashboard/statistics và visual polish rộng vẫn thuộc Slice 12.

## 7. Work packages và commit strategy

| WP | Nội dung | Commit dự kiến |
|---|---|---|
| 0 | Plan chi tiết, quyết định contract và trạng thái IN PROGRESS | `docs(plan): detail slice 08 pickup fulfillment` |
| 1 | Forward migration, preflight và expiry/index/idempotency constraints | `feat(db): enforce pickup fulfillment invariants` |
| 2 | Fulfillment module, transaction ports/gateways và projector foundation | `feat(api): scaffold pickup fulfillment orchestration` |
| 3 | Confirm/start/ready commands, audit và state policy | `feat(api): add pickup preparation commands` |
| 4 | Extend hold và idempotent expiry system command/job | `feat(api): manage pickup hold lifecycle` |
| 5 | Atomic CASH/inventory/voucher completion | `feat(api): finalize pickup atomically` |
| 6 | Internal warranty issuer và pickup lifecycle notifications | `feat(api): issue pickup warranties and notifications` |
| 7 | Tám controllers/DTOs cho Backoffice Order query/internal-note/commands, OpenAPI 95 và generated client | `feat(api): expose pickup fulfillment operations` |
| 8 | Backoffice queue/detail/actions và customer Order projection/UI | `feat(web): operate pickup fulfillment` |
| 9 | Unit/integration/E2E/concurrency/invariant coverage | `test(fulfillment): cover pickup lifecycle invariants` |
| 10 | Seed-safe smoke, rollout, docs và completion evidence | `docs(plan): complete slice 08 pickup fulfillment` |

Mỗi WP giữ build xanh và chạy gate theo phạm vi; không stage `apps/web/next-env.d.ts`, không sửa `docs/decisions`, không gộp concern không liên quan.

## 8. Test matrix

### Unit/policy

- Confirm/start/ready source state, pickup type, STORE/location và deadline guards.
- Deadline boundary `now < holdUntil` versus `now >= holdUntil`; extend bằng deadline hiện tại là replay, còn lower/past/>7d/reason invalid.
- CASH flag với positive/zero balance; Money dùng BigInt/Decimal, không `number`.
- Warranty code collision retry, snapshot interval `[startAt,endAt)` và days zero skip.
- Projector/redaction/availableActions; notification replay skip và SMTP failure.
- Scheduler mutex, bounded batch và per-row failure isolation.

### Integration/PostgreSQL

- Migration/preflight/constraints/index từ database rỗng và upgrade fixture hợp lệ.
- Confirm/start/ready/extend atomicity và deadline synchronization.
- Complete với iPhone + nhiều accessory line + voucher + nhiều warranty-eligible item; đối chiếu projection từ source records.
- Failure injection ở CASH, unit, stock counter, movement, reservation, voucher, warranty, Order/Audit làm rollback toàn transaction.
- Zero-total pickup hoàn tất PAID không Payment; positive balance tạo đúng một verified CASH.
- Expiry từ PLACED/CONFIRMED/PREPARING/READY; reservation `EXPIRED`, counter/voucher release và optional refund obligation đúng một lần.

### Concurrency

- Hai staff complete cùng lúc: một terminal outcome, một CASH/order, một movement/accessory reservation, một Warranty/eligible item.
- Complete replay sau response loss trả same logical projection.
- Complete versus expiry và complete versus customer cancel: đúng một outcome, không partial inventory/payment/warranty.
- Extend versus expiry tại boundary: hoặc deadline mới thắng và reservation tiếp tục active, hoặc expiry thắng; không hồi sinh.
- Start/ready versus expiry không thao tác sau deadline.

Test concurrency dùng barrier/clock inject, không `sleep`; sau request phải query database invariant.

### E2E/security/contract

- Đủ tám route, request/response/error envelopes, UUID params, validation và operationId đã khóa.
- EMPLOYEE/ADMIN success; CUSTOMER/GUEST/anonymous bị 401/403; resource missing 404; invalid/expired state conflict đúng code.
- Customer/guest projection chỉ own Order và không lộ internal note/location internals/audit/payment reviewer.
- OpenAPI có đúng 95 operation/95 operationId unique, access-token security, Money string, response schemas cụ thể; generated client/web typecheck không drift.
- Regression Slice 01–07 xanh; shipping deposit review/expiry và customer cancellation không đổi behavior.

Quality gate:

```text
format:check → lint → typecheck → unit
  → test DB prepare/migration-from-zero
  → integration → E2E/concurrency
  → OpenAPI 95 → generated client → build → pnpm verify
```

## 9. Seed, smoke, rollout và rollback

- Master seed tiếp tục idempotent và không sửa operational Order/reservation/payment khi chạy lại.
- `pickup-ready` smoke fixture phải đi qua checkout, confirm, start và ready application commands; không INSERT terminal status trực tiếp. Fixture dùng public marker an toàn, không ghi token/raw identifier vào artifact.
- Smoke local/Supabase: tạo pickup customer/guest, confirm/start/ready/extend/complete, verify customer projection/email/audit và query inventory/payment/voucher/warranty invariants; chạy expiry trên fixture cô lập bằng injected clock.
- Rollout: backup + exact preflight → forward migration → deploy API rồi Web trên một scheduler replica → smoke tám operation/năm command và expiry → seed hai lần → `pnpm verify`.
- Không down migration hoặc sửa/xóa history khi rollback. Code rollback chỉ khi schema backward-compatible; row active/completed thật phải forward-fix bằng application command/migration mới.
- Trước rollback, dừng duplicate scheduler replica; không cleanup Payment/Movement/Warranty theo glob hoặc target suy đoán. Chỉ thao tác exact smoke IDs đã xác minh.

## 10. Decision log

| Quyết định | Phương án không chọn | Lý do |
|---|---|---|
| 8 operation/95 total | Hoãn ba Backoffice Order query/internal-note operation | User-finalized scope cần queue/detail vận hành được và giữ tổng contract chính xác |
| Warranty issuer nội bộ ở Slice 08 | Chờ Slice 11 hoặc complete không warranty | Fulfillment completion bắt buộc warranty atomic; Slice 11 phụ thuộc Slice 08 |
| Expiry job ở Slice 08 | Chỉ viết command rồi chờ Slice 12 scheduler | Expiry/cancel E2E là DoD của slice |
| Order deadline authoritative + reservation mirror | Chọn reservation-only hoặc đọc settings hiện hành | Backoffice query/job dùng Order snapshot; settings không được viết lại lịch sử |
| `PICKUP` holdReason giữ nguyên | Chuyển `FULFILLMENT` khi confirm | Không có transition này trong state/data/API contract; giữ nghĩa pickup và deadline |
| `EXPIRED` cho timeout | Dùng generic cancellation `RELEASED` | Requirements/background-job contract phân biệt timeout với cancel chủ động |
| Partial unique + expected-state guards | Chỉ tin Serializable/application replay | Defense-in-depth cho effect tiền/tồn/warranty và bounded retry |
| Backoffice pickup UI + customer projection | Hoãn toàn bộ pickup UI sang Slice 12 | Operations cần queue/detail/action trong Slice 08; Slice 12 chỉ giữ scenario framework và hardening rộng |

## 11. Kết quả triển khai và nghiệm thu

- Đã triển khai và push riêng từng concern trên branch `feat/slice-08-pickup-fulfillment`; không sửa `docs/decisions` và không stage thay đổi cục bộ của `apps/web/next-env.d.ts`.
- OpenAPI có đúng 95 operation/95 operationId duy nhất; tám operation Slice 08 có Bearer security, UUID path, response/error schema và generated client đồng bộ.
- Hai forward migration Slice 08 đã được deploy lên Supabase. Preflight trước/sau rollout có 17/17 invariant query trả 0; migration-from-zero áp dụng đủ 6 migration.
- `pnpm verify` xanh: 114 API unit test, 13 Web test, 2 generated-client test, 27 integration test và 63 API E2E test đều qua; API/Web production build thành công.
- Seed chạy hai lần không nhân bản hoặc reset operational state. Supabase smoke hoàn tất order `RPH-20260823-L4AHFLHT`, expire order `RPH-20260823-DR3976HX`, kiểm tra CASH/reservation/stock movement/voucher/warranty/audit và replay không tạo effect trùng.
- SMTP provider local không khả dụng trong smoke nhưng notification failure được log an toàn sau commit và không rollback nghiệp vụ, đúng failure policy đã khóa.
- Trước migration đã tạo logical backup read-only tại `C:\Users\Lee\AppData\Local\Temp\rephone-slice08-logical-20260823-011952\before-slice08.json.gz`, SHA-256 `e4aa90dc715090e5e162804574552a46e12f48bd7e7ba37a9f8e7ca4045a9e94`.

## 12. Nguồn tài liệu

- [Root implementation plan — Slice 08](../../plan.md#slice-08--pickup-fulfillment)
- [Order, deposit và fulfillment requirements](../requirements/order-deposit-and-fulfillment.md)
- [Roles và permissions](../requirements/roles-and-permissions.md)
- [Warranty requirements](../requirements/warranty-and-aftersales.md)
- [State machines](../architecture/state-machines.md)
- [Fulfillment transactions](../architecture/fulfillment-transactions.md)
- [Transaction và concurrency](../architecture/transaction-and-concurrency.md)
- [Checkout transaction](../architecture/checkout-transaction.md)
- [Background jobs](../architecture/background-jobs.md)
- [Notifications](../architecture/notifications.md)
- [Backend module boundaries](../architecture/backend-modules.md)
- [Database implementation](../architecture/database-implementation.md)
- [Sales data dictionary](../data-model/sales.md)
- [Catalog/inventory data dictionary](../data-model/catalog-inventory.md)
- [Commerce data dictionary](../data-model/commerce.md)
- [Warranty/after-sales data dictionary](../data-model/after-sales.md)
- [System settings/audit data](../data-model/system.md)
- [Backoffice fulfillment API](../api/backoffice-order-fulfillment-refund-endpoints.md)
- [Checkout/customer Order API](../api/checkout-and-customer-order-endpoints.md)
- [API response contract](../api/response-contract.md)
- [API error catalog](../api/error-catalog.md)
- [OpenAPI/client contract](../api/openapi-and-client.md)
- [Testing strategy](../quality/testing-strategy.md)
- [Requirements traceability](../quality/requirements-traceability.md)
- [Seed/demo scenarios](seed-and-demo-scenarios.md)
- [Local/deployment runbook](../operations/local-development-and-deployment.md)
