# Kế hoạch triển khai Slice 10 — Order Cancellation & Refund

> Trạng thái: 🚧 IN PROGRESS — bắt đầu từ commit Slice 09 `da6d394` trên branch `feat/slice-10-order-cancellation-refund`.<br>
> Baseline: Slice 09 đã hoàn thành với đúng 101 OpenAPI operation; Slice 10 thêm đúng 10 operation, mục tiêu 111.<br>
> Phụ thuộc: Slice 07 payment proof, Slice 08 pickup fulfillment và Slice 09 shipping fulfillment đã hoàn thành.<br>
> Không sửa `docs/decisions`; behavior hiện hành theo precedence tại [docs index](../readme.md#nguồn-sự-thật-khi-có-trùng-nội-dung).

## 1. Mục tiêu, phạm vi và quyết định đã khóa

Triển khai cancellation dùng chung cho customer/guest/staff và workflow Refund thủ công mà không double-release inventory/voucher hoặc hoàn vượt tiền đã verify. Slice hoàn thành khi:

- Customer/guest tiếp tục dùng API cancel hiện có; EMPLOYEE/ADMIN hủy được Order trước hand-over hoặc sau shipping `RETURNED`.
- Cancellation atomically terminalize Order/Fulfillment/Shipment/awaiting Payment phù hợp, release active reservation/voucher và tạo đúng một Refund `REQUESTED` cho verified amount chưa được cover.
- Staff xử lý được `REQUESTED → PROCESSING → COMPLETED` hoặc `REQUESTED → REJECTED | CANCELLED`.
- Manual Refund chỉ được tạo cho Order `CANCELLED` hoặc `COMPLETED`; tổng obligation active/completed không vượt verified payment dưới concurrency.
- `BANK_TRANSFER` completion có private evidence JPEG/PNG/WebP/PDF tối đa 10 MiB; `CASH` completion không có evidence và bắt buộc note.
- Evidence lưu MIME, size và SHA-256 để exact replay không tạo object, projection, audit hoặc email trùng.
- Customer/guest chỉ thấy Refund projection public-safe trong owned Order detail; backoffice có queue/detail/cancel/create/process/evidence UI tối thiểu.
- OpenAPI tăng `101 → 111`, generated client không drift; forward migration, seed-safety, Supabase smoke và `pnpm verify` xanh.

Không thuộc Slice 10:

- Payment gateway, SePay, card refund automation hoặc customer evidence read.
- Tạo/process `RefundMethod.OTHER`; enum chỉ được giữ để đọc và terminalize record legacy `REQUESTED`.
- Refund reversal/reopen, evidence overwrite/delete, cancel Order `COMPLETED`, redelivery hoặc auto-restock hàng returned.
- Warranty void/after-sales resolution, scheduler mới, Redis/queue/outbox và multi-store.

Quyết định contract đã khóa:

1. **Đúng 10 HTTP operation mới/111 total.** Customer/guest cancel và owned Order detail đã có trong baseline 101.
2. **Một cancellation engine.** Public Order controller và backoffice controller gọi cùng application service/policy, không sao chép transaction logic.
3. **Hai module Refund.** `RefundCoreModule` provider-only sở hữu repository/aggregate policy; `RefundOperationsModule` sở hữu query, lifecycle, evidence và HTTP API.
4. **Manual create chỉ trên Order terminal nghiệp vụ.** Chỉ `CANCELLED` hoặc `COMPLETED`; không làm thay đổi finance của fulfillment đang chạy.
5. **P0 chỉ tạo BANK_TRANSFER/CASH.** `OTHER` là legacy read-only; record `OTHER/REQUESTED` chỉ reject/cancel.
6. **Evidence có content digest.** SHA-256/MIME/size là metadata bắt buộc với bank completion để phân biệt exact replay và payload khác.
7. **CASH tuyệt đối không evidence.** Client gửi JSON note, backend không nhận hoặc lưu file.
8. **Không thêm idempotency key cho manual create.** Hai partial Refund giống nhau có thể là nghiệp vụ hợp lệ; Serializable aggregate lock là safety boundary.
9. **Refund không mở lại Order balance.** Completion chỉ recompute `refundedAmount` và `paymentStatus`; Order status và `balanceDue` giữ nguyên.
10. **Provider ngoài transaction.** Storage upload xảy ra trước completion transaction; email chạy sau commit.

## 2. Kiến trúc, API, projection và UI

```text
OrdersModule
  └── OrderCancellationModule

OrderCancellationModule
  ├── OrderTransactionPortsModule
  ├── PaymentCoreModule / RefundCoreModule
  ├── InventoryModule / VouchersModule
  └── AuditModule / NotificationsModule

RefundOperationsModule
  ├── RefundCoreModule / PaymentCoreModule
  ├── OrderTransactionPortsModule
  └── StorageModule / AuditModule / NotificationsModule
```

- `OrderCancellationModule` thay logic cancellation đang nằm trực tiếp trong `OrdersService`; public route giữ nguyên transport/ownership behavior.
- `RefundCoreModule` export gateway nhận `Prisma.TransactionClient`; repository không tự mở transaction.
- `PaymentCoreModule` export port lock/read verified finance; Refund workflow không nằm trong Payment application service.
- `StorageModule` export private evidence validator dùng chung cho Payment/Refund và Slice 11.
- Existing payment expiry/reject và fulfillment flows chỉ tái sử dụng low-level port; không gọi application service bên trong transaction khác.
- Không `forwardRef`, nested transaction, controller gọi Prisma hoặc provider network call trong database transaction.

### API — đúng 10 operation mới

| Method/path | operationId | Request | Success |
|---|---|---|---|
| `POST /api/v1/backoffice/orders/:id/cancel` | `cancelBackofficeOrder` | `{ reason }` | `200 BackofficeOrderDetailDto` |
| `GET /api/v1/backoffice/refunds` | `listBackofficeRefunds` | Filter/pagination | Paginated `RefundListItemDto` |
| `GET /api/v1/backoffice/refunds/:id` | `getBackofficeRefund` | — | `200 RefundDetailDto` |
| `POST /api/v1/backoffice/orders/:id/refunds` | `createRefund` | `{ paymentId?, amount, method, reason }` | `201 RefundDetailDto` |
| `POST /api/v1/backoffice/refunds/:id/start-processing` | `startRefundProcessing` | `{ note? }` | `200 RefundDetailDto` |
| `POST /api/v1/backoffice/refunds/:id/complete-bank-transfer` | `completeBankTransferRefund` | Multipart `{ file, note }` | `200 RefundDetailDto` |
| `POST /api/v1/backoffice/refunds/:id/complete-cash` | `completeCashRefund` | `{ note }` | `200 RefundDetailDto` |
| `POST /api/v1/backoffice/refunds/:id/reject` | `rejectRefund` | `{ reason }` | `200 RefundDetailDto` |
| `POST /api/v1/backoffice/refunds/:id/cancel` | `cancelRefund` | `{ reason }` | `200 RefundDetailDto` |
| `GET /api/v1/backoffice/refunds/:id/evidence-url` | `getRefundEvidenceUrl` | — | `{ url, expiresAt }` |

Mọi operation Bearer-only, role EMPLOYEE/ADMIN, UUID path, response envelope chuẩn và `Cache-Control: no-store`. Money là decimal digit string; reason/note trim 5..500. Bank upload nhận đúng một field `file`; unknown/multiple field bị reject.

List query:

```text
status?, method?, orderNumber?, createdFrom?, createdTo?,
page=1, pageSize=20,
sortBy=createdAt|amount|processingAt,
sortOrder=asc|desc
```

- API default `createdAt desc, id desc`, luôn có `id` tie-breaker; `processingAt` null cuối.
- `orderNumber` trim/uppercase và tìm exact/prefix.
- UI queue mặc định gửi `status=REQUESTED`, `sortBy=createdAt`, `sortOrder=asc`.

Projection:

- `RefundListItemDto`: Order number, amount, method, status, requester type/safe actor, timestamps và `evidenceAvailable`.
- `RefundDetailDto`: safe Payment source, reason, current operational note, processor/terminal actor, terminal reason và backend-authoritative `availableActions`.
- `OrderRefundDto`: amount, method, status, business/terminal reason và timeline; không actor nội bộ, note, digest, bucket, path hoặc signed URL.
- `BackofficeOrderDetailDto`: thêm `refundableAmount`, `CANCEL_ORDER` và `CREATE_REFUND` khi policy cho phép.
- Refund action: REQUESTED cho start/reject/cancel; PROCESSING bank/cash cho đúng completion command; COMPLETED bank cho evidence read. `OTHER` chỉ có reject/cancel khi REQUESTED.

UI:

- `/backoffice/refunds`: queue/filter/pagination và age indicator.
- `/backoffice/refunds/[id]`: Order/Payment summary, amount, reason, actor timeline và action cards.
- Backoffice Order detail thêm staff cancel, manual Refund với `refundableAmount` read-only và link Refund liên quan.
- Customer Order detail hiển thị Refund public timeline; staff header thêm “Hoàn tiền”.
- Mutation disable double-submit, refetch authoritative detail sau success/conflict và focus alert cho 409/422. Signed evidence mở tab mới với `noopener noreferrer`.

## 3. Database, transaction, evidence và failure handling

### Forward migration và preflight

Không sửa baseline/shared migration. Bổ sung Refund columns `evidenceMimeType`, `evidenceFileSize`, `evidenceSha256` và enforce:

- `amount > 0`; reason/terminalReason/note không blank và đúng giới hạn application.
- REQUESTED không processor/completion/terminal/evidence; PROCESSING có processor/time và chưa completion/terminal/evidence.
- COMPLETED có processor, processing/completion time và không terminal fields; REJECTED/CANCELLED có terminal actor/time/reason và không processing/completion/evidence.
- BANK_TRANSFER COMPLETED có đủ bucket/path/MIME/size/SHA-256; CASH COMPLETED không evidence.
- Evidence fields all-null/all-present, path thuộc `refunds/{refundId}/`, size `1..10 MiB`, digest lowercase SHA-256 64 ký tự.
- Timestamp theo `createdAt <= processingAt <= completedAt|terminalAt`.
- STAFF requester bắt buộc user ID; SYSTEM không có user ID; CUSTOMER cho phép null với guest.
- `Order.refundedAmount` trong `0..paidAmount`.
- Unique `(Payment.id, Payment.orderId)` và composite FK bảo đảm optional Refund Payment thuộc cùng Order.
- Queue index `(status, createdAt, id)` và processing index `(status, processingAt, id)`.

Cross-row refund sum ở application Serializable transaction, không trigger. Exact preflight dừng rollout nếu lifecycle/timestamp, Payment/Order relation, active+completed amount, legacy OTHER hoặc completed bank evidence vi phạm. Không auto-repair/backfill dữ liệu lạ.

### Cancellation transaction

Dùng `SerializableTransactionRunner`: `maxWait=2s`, `timeout=5s`, tối đa ba execution; chỉ retry serialization/deadlock với backoff 25/75 ms cộng jitter.

```text
Order → Shipment → Payments sorted → Refunds sorted
      → Reservations sorted → Units/StockLevels sorted
      → Voucher/VoucherUsage
```

1. Lock Order, authorize owner/role và recheck state.
2. Order đã CANCELLED là replay: trả projection hiện hành, không rewrite reason/audit/email.
3. Chặn Payment UNDER_REVIEW, fulfillment IN_TRANSIT/FAILED/COMPLETED và Order COMPLETED. Staff được thêm nhánh SHIPPING/RETURNED.
4. Tính bằng BigInt: `verifiedTotal - completedTotal - requestedOrProcessingTotal`; giá trị âm là invariant failure, không clamp.
5. Cancel Order/Fulfillment và Shipment CREATED; cancel awaiting Payment nhưng giữ VERIFIED Payment.
6. Release active reservation/accessory counter/VoucherUsage đúng một lần.
7. Nếu refundable > 0, tạo một BANK_TRANSFER/REQUESTED Refund; chỉ gắn `paymentId` khi có đúng một source Payment.
8. Nhánh RETURNED không restock accessory, không đổi reservation CONSUMED và giữ iPhone INSPECTING.
9. Audit cùng transaction; email sau commit.

### Manual create và lifecycle

- Manual create chỉ cho Order CANCELLED/COMPLETED. Optional Payment phải VERIFIED, thuộc cùng Order và còn đủ refundable amount.
- Lock Order → Payments → toàn bộ Refund sorted; REQUESTED/PROCESSING/COMPLETED cùng giữ aggregate quota, REJECTED/CANCELLED không giữ quota.
- Start chỉ REQUESTED; lưu processor/time và optional note. EMPLOYEE chỉ complete record mình start; ADMIN được break-glass complete nhưng không overwrite original processor.
- Exact start replay yêu cầu cùng actor và normalized note; khác payload/actor conflict.
- Completion lock/recompute aggregate, require không vượt verified total, chuyển Refund COMPLETED rồi recompute `Order.refundedAmount` và `paymentStatus` partial/full refund. Không đổi Order status hoặc `balanceDue`.
- Completion note thay optional start note và trở thành operational note cuối; AuditLog giữ hành động/actor và safe note metadata.
- Reject/cancel chỉ REQUESTED, lưu terminal fields và không overwrite business reason. Exact actor+reason replay; terminal action/payload khác conflict. PROCESSING chỉ complete.

### Private evidence

- Validate JPEG/PNG/WebP bằng `sharp`, PDF bằng `pdf-lib`; reject empty, malformed, spoof, SVG/HEIC/executable và file >10 MiB.
- Tính SHA-256 trên bytes đã validate; server sinh `refunds/{refundId}/{uuid}.{ext}` trong private bucket.
- Authorize trước multipart. Nếu Refund đã COMPLETED, cùng digest+normalized note trả current trước upload; khác digest/note conflict.
- Refund PROCESSING upload ngoài transaction với `upsert=false`; transaction recheck state/processor/aggregate và attach metadata atomically.
- Concurrent loser xóa exact object vừa upload best-effort; cleanup fail ghi `storage_orphan_candidate`, không lộ object path.
- Evidence read chỉ staff/admin, authorize và audit trước khi trả; TTL `min(config, 300 giây)`, PDF dùng download disposition. URL/path/digest không log, audit hoặc public DTO.
- Mutation/signed URL giới hạn 120/phút/actor; upload đồng thời 20/10 phút/actor. `429` trả `Retry-After`.

## 4. Test matrix và quality gates

- Unit: cancellation policy; BigInt refundable; lifecycle/processor/actions; file validation/digest/replay; safe projector và notification.
- Database/integration: every forward constraint/index/composite FK; rollback tại Refund/inventory/voucher/audit; aggregate create/complete; seed hai lần không đổi PROCESSING/COMPLETED/evidence.
- Concurrency dùng barrier/latch, không sleep: staff/staff và staff/customer cancel; cancel cạnh handover/proof/verify; two-create at limit; auto/manual create; start/reject/cancel; two bank completion; two Refund completion cùng Order; exact/different evidence replay và cleanup.
- E2E/security: đúng 10 API; anonymous 401, CUSTOMER 403, EMPLOYEE/ADMIN đúng quyền; cancel pre-handover/after RETURNED; bank/CASH/reject/cancel; filter/sort; 409/413/415/422/429/503; no-store và redaction.
- Contract/web: đúng 111 unique operationId, Bearer/UUID/multipart/error schemas, typed client không drift; queue/detail/action/customer timeline.
- Regression/performance: Slice 01–09 xanh; RETURNED không auto-restock; list/detail/normal command p95 <500 ms ở 20–50 concurrent users, không tính Storage/SMTP latency và không N+1.

Quality gate:

```text
pnpm format:check → pnpm lint → pnpm typecheck → pnpm test
→ pnpm test:db:prepare → pnpm test:integration → pnpm test:e2e
→ pnpm api:openapi → pnpm api:client → pnpm build → pnpm verify
```

## 5. Work packages, rollout và Decision Log

| WP | Nội dung | Commit dự kiến |
|---|---|---|
| 0 | Plan chi tiết, contract clarification và root plan IN PROGRESS | `docs(plan): detail slice 10 implementation` |
| 1 | Forward migration, exact preflight, indexes và seed safety | `feat(db): enforce refund workflow invariants` |
| 2 | RefundCore, shared cancellation engine và transaction ports | `refactor(api): centralize cancellation and refund finance` |
| 3 | Refactor customer/guest cancel và thêm staff cancellation | `feat(api): add staff order cancellation` |
| 4 | Refund list/detail/manual create và aggregate policy | `feat(api): add refund query and creation` |
| 5 | Start/reject/cancel/CASH completion | `feat(api): process refunds atomically` |
| 6 | Private bank evidence, exact replay, cleanup và signed URL | `feat(api): add private refund evidence` |
| 7 | Safe projections, actions, audit và notifications | `feat(api): expose safe refund projections` |
| 8 | OpenAPI 111 và generated client | `chore(api): generate slice 10 contracts` |
| 9 | Backoffice queue/detail/cancel/create/action UI | `feat(web): add refund operations backoffice` |
| 10 | Customer Refund timeline | `feat(web): surface customer refund progress` |
| 11 | Guarded refund-processing demo scenario | `feat(demo): add refund processing scenario` |
| 12 | Unit/integration/E2E/concurrency/security/performance | `test(refunds): cover slice 10 invariants` |
| 13 | Guarded Supabase preflight/smoke | `test(refunds): add Supabase slice 10 smoke` |
| 14 | Rollout, nghiệm thu và chuyển plan sang Slice 11 | `docs(plan): mark slice 10 complete` |

Rollout: backup + exact preflight → forward migration → deploy API/Web → seed hai lần và so operational fingerprint → bank/CASH smoke → full quality gate. Bank smoke đi qua deposit verify → shipping failed/returned → stock return → staff cancel → process/complete evidence; CASH smoke tạo partial refund trên completed pickup. Business transition chỉ qua API/application command; SQL chỉ dùng preflight/assertion.

Rollback không down/reset database, xóa Refund/evidence/history hoặc sửa finance bằng SQL. Không rollback application khi có Refund thật PROCESSING; complete hoặc forward-fix trước. Cleanup orphan chỉ theo exact bucket/path đã xác minh. Khi trễ, cắt filter/PDF preview/email HTML/CSS/browser-smoke breadth trước; không cắt 10 API, no-over-refund, returned cancellation, bank/CASH backend, private evidence, RBAC, audit hay concurrency tests.

| Quyết định | Phương án không chọn | Lý do |
|---|---|---|
| Shared cancellation engine | Public/staff service riêng | Một lock order và policy tránh double-release/refund drift |
| RefundCore + Operations | Gộp vào Payments/Orders | Refund có aggregate/lifecycle/evidence riêng, vẫn tái dùng finance ports |
| Evidence SHA-256/MIME/size | Chỉ bucket/path | Exact replay có thể phân biệt cùng file và file khác |
| BANK_TRANSFER/CASH only | Expose OTHER completion | Không có completion transport/policy rõ cho OTHER trong P0 |
| Serializable aggregate cap | Content-dedupe/idempotency key | Hai partial refund cùng payload có thể hợp lệ; cần bảo vệ số tiền thay vì đoán intent |
| CASH no evidence | Evidence optional | Contract đơn giản, DB lifecycle rõ và đúng kênh hoàn tiền tại quầy |
| Keep balance/status | Reopen balance/fulfillment | Refund là projection sau thu tiền, không làm sống lại Order đã terminal |
| Private signed read <=300s | Public/permanent evidence URL | Giới hạn lộ dữ liệu và bắt buộc authorize mỗi lần |

## Nguồn contract

- [Cancellation/refund transaction](../architecture/order-cancellation-and-refund.md)
- [Refund processing](../architecture/refund-processing.md)
- [Backoffice Order/Fulfillment/Refund API](../api/backoffice-order-fulfillment-refund-endpoints.md)
- [Sales data dictionary](../data-model/sales.md)
- [File upload pipeline](../architecture/file-upload-pipeline.md)
- [Transaction và concurrency](../architecture/transaction-and-concurrency.md)
- [Authentication và security](../architecture/authentication-and-security.md)
- [Testing strategy](../quality/testing-strategy.md)
- [Seed/demo scenarios](seed-and-demo-scenarios.md)
- [Deployment runbook](../operations/local-development-and-deployment.md)
