# Kế hoạch triển khai Slice 09 — Shipping Fulfillment, COD & Tracking

> Trạng thái: 🚧 IN PROGRESS — WP0/WP1 bắt đầu ngày 2026-08-23.<br>
> Baseline: Slice 08 đã hoàn thành với đúng 95 OpenAPI operation; Slice 09 thêm đúng 6 operation, mục tiêu 101.<br>
> Phụ thuộc: Slice 07 deposit lifecycle và Slice 08 fulfillment foundation đã hoàn thành.<br>
> Không sửa `docs/decisions`; behavior hiện hành theo precedence tại [docs index](../readme.md#nguồn-sự-thật-khi-có-trùng-nội-dung).

## 1. Mục tiêu, phạm vi và quyết định đã khóa

Triển khai trọn vòng đời shipping thủ công từ Order đã confirm đến carrier handover, delivered/COD hoặc failed/returned mà không consume tồn, thu tiền, consume voucher hay phát hành warranty hai lần. Slice hoàn thành khi:

- EMPLOYEE/ADMIN override shipping fee trước proof, tạo đúng một Shipment attempt, handover, delivered, failed và returned bằng named command.
- Handover và delivered chạy trong `Serializable` transaction; tiền, reservation, tồn, voucher, warranty, Shipment, fulfillment và Order cùng commit hoặc cùng rollback.
- Customer Order detail chỉ nhận carrier/tracking/status/timestamp public an toàn; backoffice Order detail có action vận hành shipping phù hợp state.
- OpenAPI tăng từ 95 lên đúng 101 operation/operationId duy nhất; generated client không drift.
- Forward migration, exact preflight, migration-from-zero, seed hai lần, focused tests và `pnpm verify` xanh.
- Happy path deposit → prepare → shipment → handover → COD delivered và failure → returned có invariant query sau commit.

Không thuộc Slice 09:

- Carrier API/webhook/polling, label purchase, tracking history, route optimization hoặc auto status sync.
- Redelivery hay Shipment attempt 2; P0 giữ đúng một Shipment/order và `attemptNumber = 1`.
- Bank-transfer balance; pickup dùng CASH và shipping dùng COD cho balance authoritative.
- Tự động nhập lại accessory khi returned. Staff inspect rồi gọi stock return hiện có với Shipment reference.
- Staff cancellation/refund processing/evidence thuộc Slice 10; Slice 09 chỉ terminalize Shipment `CREATED → CANCELLED` khi cancellation command hiện có hủy shipping Order trước handover.
- Warranty/customer after-sales API thuộc Slice 11; Slice 09 chỉ tái dùng internal warranty issuer ở terminal fulfillment.
- Permanent demo-scenario framework, queue/outbox, distributed scheduler/mutex, multi-replica hardening và dashboard rộng thuộc Slice 12/P1.

Các quyết định contract đã khóa:

1. **Đúng 6 HTTP operation mới/101 total.** Shared `start-preparing` và backoffice list/detail/internal-note đã có từ Slice 08; customer tracking đi qua customer Order list/detail hiện có.
2. **`FulfillmentModule` tiếp tục là orchestrator.** Module sở hữu command policy/transaction boundary và dùng gateway nhận cùng Prisma transaction client từ Orders, Payments, Inventory, Vouchers, Warranty, Audit và Notifications. Không nested transaction, `forwardRef` hay controller gọi Prisma.
3. **One shipment attempt P0.** Shipment unique/order, unique `(orderId, attemptNumber)` và `attemptNumber=1`; không tạo attempt mới sau FAILED/RETURNED.
4. **Override chỉ trước proof và trước deadline.** Require SHIPPING `PLACED/PENDING`, deposit `AWAITING_PROOF`, chưa evidence/submit/review/verify, và `now < expiresAt`; tại `now >= expiresAt`, expiry thắng và override bị reject sau lock/recheck.
5. **Override không tăng deposit snapshot.** `depositRequired = min(depositRequired hiện tại, grandTotal mới)`. Nếu bằng zero, cancel awaiting Payment, confirm Order và đổi active reservation `DEPOSIT → FULFILLMENT` trong cùng commit.
6. **Inventory consume tại handover.** iPhone `AVAILABLE → IN_TRANSIT`; accessory giảm `quantityOnHand` và `quantityReserved`, tạo một SALE movement theo reservation; delivered không trừ accessory lần hai.
7. **COD không nhận amount từ client.** Nếu DB-authoritative balance dương, request chỉ xác nhận `confirmCodCollected=true`; backend tạo+verify đúng một `BALANCE/COD` bằng balance. Balance zero không tạo Payment.
8. **Return không làm accessory sellable.** iPhone chuyển về location đã nhận và `IN_TRANSIT → INSPECTING`; accessory chỉ được nhập lại sau inspection qua stock return với `referenceType=SHIPMENT`, `referenceId=shipmentId`, tối đa một RETURN/Shipment/variant.
9. **Replay theo đúng state đích.** Handover và delivered replay trả projection đã commit, không lặp effect/notification. Create cùng Order trả Shipment hiện tại chỉ khi normalized payload giống hệt; payload khác hoặc attempt/state khác conflict. Failed/returned cùng terminal state và normalized reason/location giống hệt là replay; khác payload hoặc state đã đi xa hơn conflict.
10. **Audit trong commit, provider sau commit.** Notification chỉ phát cho transition mới; response-loss replay không gửi lại. Provider fail không rollback nghiệp vụ.

## 2. Kiến trúc, API, state và transaction

```text
FulfillmentModule
  ├── AuthModule / AuditModule
  ├── OrderTransactionPortsModule
  ├── PaymentCoreModule
  ├── InventoryModule
  ├── VouchersModule
  ├── WarrantyModule
  └── NotificationsModule
```

- `FulfillmentController` validate UUID/body, enforce access-token EMPLOYEE/ADMIN và gọi shipping command service.
- Shipping fulfillment service sở hữu override/create/handover/delivered/failed/returned policy, injected clock và `Serializable` orchestration.
- Repository lock/load Order/Shipment graph và build safe backoffice/customer projections; repository không gửi provider notification.
- Tất cả callback nhiều aggregate dùng lock order thống nhất: **Order → Shipment → Payment/Refund theo ID đã sort → InventoryReservation/InventoryUnit/StockLevel theo ID đã sort → VoucherUsage → Warranty business key**. Retry bao quanh toàn callback; không đổi thứ tự giữa commands.

### API — đúng 6 operation mới

| Method/path | operationId | Request | Success |
|---|---|---|---|
| `POST /api/v1/backoffice/orders/:id/override-shipping-fee` | `overrideShippingFee` | `{ shippingFee, reason }` | `200 BackofficeOrderDetailDto` |
| `POST /api/v1/backoffice/orders/:id/shipment` | `createShipment` | `{ carrierName, trackingCode, trackingUrl? }` | `201 ShipmentDto`; exact replay `200` |
| `POST /api/v1/backoffice/shipments/:id/hand-over` | `handOverShipment` | bodyless | `200 BackofficeOrderDetailDto` |
| `POST /api/v1/backoffice/shipments/:id/mark-delivered` | `markShipmentDelivered` | `{ confirmCodCollected? }` | `200 BackofficeOrderDetailDto` |
| `POST /api/v1/backoffice/shipments/:id/mark-failed` | `markShipmentFailed` | `{ reason }` | `200 BackofficeOrderDetailDto` |
| `POST /api/v1/backoffice/shipments/:id/mark-returned` | `markShipmentReturned` | `{ returnedToLocationId, reason }` | `200 BackofficeOrderDetailDto` |

Mọi operation require active EMPLOYEE/ADMIN, access-token security, UUID path, response envelope `{ data }`, Money digit string và Instant ISO-8601 UTC. DTO trim string, reject unknown field; reason 5..500, carrier/tracking nonblank, URL optional chỉ `https`. Không nhận status, attempt, amount, actor, authoritative timestamp hoặc source inventory location từ client. Error chính theo catalog hiện hành: `VALIDATION_FAILED`, `AUTH_REQUIRED`, `FORBIDDEN`, `RESOURCE_NOT_FOUND`, `INVALID_STATE_TRANSITION`, `CONCURRENT_MODIFICATION`, `DUPLICATE_RESOURCE`, `INVENTORY_NOT_AVAILABLE`, `ORDER_NOT_FULLY_PAID` và `RATE_LIMITED`.

### Transition và invariant

```text
Order/Fulfillment:
CONFIRMED/PENDING → PROCESSING/PREPARING → PROCESSING/IN_TRANSIT
                                              ├→ COMPLETED/COMPLETED
                                              └→ PROCESSING/FAILED → PROCESSING/RETURNED

Shipment:
CREATED → HANDED_TO_CARRIER → DELIVERED
   └→ CANCELLED          └→ FAILED → RETURNED
```

- Create Shipment require SHIPPING Order `PROCESSING/PREPARING`, active `FULFILLMENT` reservation và không có Shipment. Tạo attempt 1/CREATED; chưa consume inventory.
- Handover require CREATED plus complete tracking and verified/zero deposit outcome. Trong một transaction: consume every active reservation; iPhone AVAILABLE→IN_TRANSIT; accessory decrement on-hand/reserved và append unique SALE/reservation; Shipment → HANDED_TO_CARRIER với `shippedAt`; fulfillment → IN_TRANSIT. Không tạo COD/warranty hoặc complete Order.
- Delivered require HANDED_TO_CARRIER + PROCESSING/IN_TRANSIT. Lock/recompute verified Payment và completed Refund totals; create verified BALANCE/COD chỉ cho positive balance và require resulting payment summary PAID. Shipment → DELIVERED, fulfillment/Order → COMPLETED; iPhone IN_TRANSIT→SOLD; accessory không decrement lần hai; VoucherUsage → CONSUMED; issue Warranty từ OrderItem snapshot; Audit cùng commit, `order.completed` sau commit.
- Failed require HANDED_TO_CARRIER + IN_TRANSIT; ghi nonblank reason/`failedAt`, Shipment → FAILED, fulfillment → FAILED; Order vẫn PROCESSING, unit vẫn IN_TRANSIT, không hoàn inventory.
- Returned require FAILED; returned location là active STORE/WAREHOUSE, ghi location/reason/`returnedAt`, Shipment → RETURNED và fulfillment → RETURNED. iPhone đổi location rồi → INSPECTING; accessory không đổi StockLevel. Sau đó Slice 10 cancellation/refund mới terminalize Order.
- Customer/staff cancellation trước handover phải chuyển Shipment CREATED → CANCELLED trong cùng cancellation transaction. Không cancel khi HANDED/IN_TRANSIT/FAILED; sau RETURNED staff cancellation thuộc Slice 10.
- Lifecycle/timestamps có thứ tự `createdAt <= shippedAt <= deliveredAt|failedAt <= returnedAt`; forbidden timestamp/reason/location phải null ở state chưa tương ứng.

## 3. Database, migration, preflight và idempotency

WP1 là forward-only migration, không sửa migration đã chia sẻ và không auto-repair operational row:

- Strengthen SHIPPING Order lifecycle pairs và completed finance projection; giữ pickup constraints Slice 08 nguyên vẹn.
- Giữ `orders_shipping_deposit_check`; thay `payments_checkout_deposit_check` để cho phép đúng exception `BANK_TRANSFER/DEPOSIT`, `status=CANCELLED`, `expectedAmount=0` do fee override giảm grand total về zero. Mọi bank deposit non-cancelled vẫn require positive expected amount.
- Strengthen shipping override metadata all-or-none, only SHIPPING, reason trim nonblank, actor/time present và timestamp không trước Order placement.
- Strengthen Shipment shape: shipping owner, attempt 1, carrier/tracking nonblank, optional HTTPS URL, exact status/timestamps/reason/return location. Cross-table owner/location checks nằm trong exact preflight và application lock/recheck.
- COD fulfillment shape: `BALANCE/COD/VERIFIED`, positive `expectedAmount=receivedAmount`, reviewer/time present, không bank/QR/proof/deadline/submission/rejection field; partial unique đúng một BALANCE/COD/order.
- Completed shipping finance phải khớp aggregate verified Payment/completed Refund, `paid >= grandTotal`, `balanceDue=0`, payment status PAID/partial-refund/refunded phù hợp.
- Partial unique RETURN StockMovement theo `(referenceId, variantId)` khi `type=RETURN AND referenceType=SHIPMENT`; movement vẫn phải có positive quantity, `toLocationId`, không `fromLocationId` và Shipment/OrderItem/location alignment được exact preflight kiểm tra.
- Partial shipping work-queue index theo fulfillment/status/update/id cho nonterminal SHIPPING rows; test query/index catalog chống drift.

Exact preflight trả named count cho từng invariant và dừng rollout nếu bất kỳ count > 0: shipping lifecycle/deposit/override metadata; Shipment owner/shape/timeline/return location; COD shape/duplicate; completed finance/inventory/voucher/warranty; duplicate Shipment stock return; shipping queue candidate shape. Không dùng approximate sample và không mutate dữ liệu.

Defense-in-depth/replay:

- Order/Shipment conditional source-state transition quyết định winner; loser lock/read lại và chỉ replay nếu committed state/payload khớp.
- One Shipment/order, one COD/order, one SALE/accessory reservation, one Warranty/orderItem và one RETURN/Shipment/variant có database business key.
- Handover response-loss replay không consume/decrement lần hai; delivered replay không tạo COD, voucher consume, warranty, unit sale hoặc email lần hai.
- Handover versus cancellation và delivered versus failed chỉ có một outcome; transaction rollback không để mixed Shipment/fulfillment/inventory/payment projection.
- Không có background job mới trong Slice 09. Existing deposit expiry command/job tiếp tục lock/recheck deadline; override cạnh tranh với expiry theo cùng Order-first order.

## 4. Backoffice/customer UI, test matrix và quality gates

- Backoffice Order queue/detail hiện có thêm shipping/tracking projection và `availableActions`; detail cho phép override fee, nhập carrier/tracking, handover, delivered/COD, failed và returned theo state/role. Dialog reason/location và COD confirmation không nhận amount.
- Mutations disable khi submit, chống double-click, hiển thị field/server error an toàn, refetch detail/list sau success/conflict; loading/empty/error/access-denied và keyboard focus phải usable trên mobile.
- Customer Order detail chỉ trả carrier name, tracking code, validated HTTPS URL, Shipment status và public timestamps. Không trả internal note, actor IDs, failure/return internal reason/location, cost, reservation internals, evidence/private path hoặc audit metadata. Customer response dùng `Cache-Control: private, no-store`.
- UI demo happy path: employee start preparing → create Shipment → handover → delivered. Failure/return dùng seed fixture đi qua application command; permanent scenario framework vẫn Slice 12.

Test bắt buộc:

- Unit/policy: fee/deposit BigInt, deadline boundary, DTO normalization/URL, state/action/replay matrix, COD flag for positive/zero balance, safe projector/no-store, notification postcommit/replay skip.
- PostgreSQL constraints/preflight: every named check rejects malformed row and accepts boundary-valid row; partial uniques; queue index; migration-from-zero and upgrade fixture.
- Integration: deposit chưa verified không handover; handover consumes iPhone/accessory exactly once; delivered recomputes DB finance and creates exactly one COD/warranty; zero balance creates no Payment; injected failure rolls back whole aggregate.
- Failure/return: failed keeps unit IN_TRANSIT and stock unchanged; returned moves iPhone to INSPECTING/location; accessory remains non-sellable until explicit Shipment-referenced stock return, duplicate same Shipment/variant rejected.
- Concurrency without sleep: two handovers, two delivered, handover versus cancellation, delivered versus failed, override versus deposit expiry; assert database invariants after requests.
- E2E/security/contract: six routes, EMPLOYEE/ADMIN allowed, CUSTOMER/GUEST/anonymous denied, exact responses/error codes; OpenAPI exactly 101 unique operationIds and generated client/web typecheck.
- Seed safety: seed twice never rewinds/resets operational Shipment/Order/Payment/reservation/stock/voucher/warranty state; shipping fixtures are created through application commands.

Quality gate:

```text
format:check → lint → typecheck → unit
  → test DB prepare/migration-from-zero → preflight/constraints/integration/concurrency
  → E2E → OpenAPI 101 → generated client → API/Web build → pnpm verify
```

## 5. Work packages, rollout và Decision Log

| WP | Nội dung | Commit dự kiến |
|---|---|---|
| 0 | Plan chi tiết, contract 6/101 và root plan IN PROGRESS | `docs(plan): detail slice 09 shipping fulfillment` |
| 1 | Forward migration, exact preflight, constraint/integration/seed-safety tests | `feat(db): enforce shipping fulfillment invariants` |
| 2 | Shipping policy, DTO/projector và transaction/gateway foundation trong FulfillmentModule | `feat(api): scaffold shipping fulfillment orchestration` |
| 3 | Shipping fee override với deposit-expiry race và postcommit notification | `feat(api): override shipping pricing safely` |
| 4 | Create Shipment và handover atomic inventory consumption | `feat(api): hand over shipping inventory` |
| 5 | Delivered/COD/voucher/warranty atomic finalization | `feat(api): complete shipping delivery` |
| 6 | Failed/returned commands và Shipment-referenced stock return guard | `feat(api): handle failed shipping returns` |
| 7 | Six controllers/OpenAPI 101/generated client và safe customer projection | `feat(api): expose shipping fulfillment operations` |
| 8 | Backoffice shipping actions và customer tracking UI | `feat(web): operate shipping fulfillment` |
| 9 | E2E/concurrency/regression, seed-safe smoke và rollout evidence | `test(fulfillment): cover shipping lifecycle` |

Rollout: backup + exact preflight → forward migration → deploy API rồi Web → smoke six new operations plus shared start-preparing/customer tracking → seed hai lần → full quality gate. Không down migration, sửa/xóa migration history, deploy/reset từ development task hoặc cleanup theo glob. Rollback code chỉ khi schema backward-compatible; operational row phải forward-fix bằng application command/migration mới và exact verified IDs.

| Quyết định | Phương án không chọn | Lý do |
|---|---|---|
| 6 operation mới/101 total | Tính shared start/list/detail là operation Slice 09 | Chúng đã thuộc baseline 95; contract mới chỉ có sáu mutation shipping |
| FulfillmentModule orchestrates | Tạo Shipping module phụ thuộc vòng hoặc controller orchestration | Giữ transaction boundary và ports đã ổn định từ Slice 08 |
| Consume inventory tại handover | Trừ lại tại delivered | Carrier đã nhận hàng; delivered replay không được double-consume |
| One attempt P0 | Redelivery sau failed/returned | Requirements khóa attempt 1; multi-attempt cần policy inventory mới |
| COD from authoritative balance | Client gửi amount | Ngăn under/over-collection projection và giữ atomic completion |
| Returned accessory needs inspection | Auto increment StockLevel | Returned không đồng nghĩa sellable; explicit stock return giữ audit/reference |
| No new background job | Carrier polling/return automation | P0 vận hành thủ công; chỉ reuse deposit expiry hiện có |
| Exact preflight + partial uniques | Chỉ application checks | Rollout fail-fast và defense-in-depth cho effect tài chính/tồn |

Nguồn:

- [Root implementation plan — Slice 09](../../plan.md#slice-09--shipping-tracking-cod-và-return)
- [Order, deposit và fulfillment requirements](../requirements/order-deposit-and-fulfillment.md)
- [Roles và permissions](../requirements/roles-and-permissions.md)
- [State machines](../architecture/state-machines.md)
- [Fulfillment transactions](../architecture/fulfillment-transactions.md)
- [Transaction và concurrency](../architecture/transaction-and-concurrency.md)
- [Order cancellation/refund](../architecture/order-cancellation-and-refund.md)
- [Background jobs](../architecture/background-jobs.md)
- [Notifications](../architecture/notifications.md)
- [Backend module boundaries](../architecture/backend-modules.md)
- [Database implementation](../architecture/database-implementation.md)
- [Sales data dictionary](../data-model/sales.md)
- [Catalog/inventory data dictionary](../data-model/catalog-inventory.md)
- [Commerce data dictionary](../data-model/commerce.md)
- [Warranty/after-sales data dictionary](../data-model/after-sales.md)
- [Backoffice fulfillment API](../api/backoffice-order-fulfillment-refund-endpoints.md)
- [Checkout/customer Order API](../api/checkout-and-customer-order-endpoints.md)
- [API response contract](../api/response-contract.md)
- [API error catalog](../api/error-catalog.md)
- [OpenAPI/client contract](../api/openapi-and-client.md)
- [Testing strategy](../quality/testing-strategy.md)
- [Requirements traceability](../quality/requirements-traceability.md)
- [Seed/demo scenarios](seed-and-demo-scenarios.md)
- [Local/deployment runbook](../operations/local-development-and-deployment.md)
