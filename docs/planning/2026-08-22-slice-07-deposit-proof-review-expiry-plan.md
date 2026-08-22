# Kế hoạch triển khai Slice 07 — Deposit Proof, Review & Expiry

> Trạng thái: ✅ Hoàn thành và đã deploy Supabase trên branch `feat/slice-07-deposit-proof-review-expiry`, bắt đầu từ commit Slice 06 `02da362`.<br>
> Bước kế tiếp sau nghiệm thu: Slice 08 — Pickup fulfillment.

## 1. Mục tiêu và Definition of Done

Triển khai trọn vòng đời shipping deposit thủ công: owner CUSTOMER/guest nộp proof, EMPLOYEE/ADMIN review, và scheduler expire payment chưa nộp proof. Hoàn thành khi:

- OpenAPI tăng đúng từ 81 lên 87 operation.
- Proof JPEG/PNG/WebP/PDF tối đa 10 MiB được upload private qua backend.
- Submit atomically chuyển Payment sang `UNDER_REVIEW` và reservation sang `REVIEW`.
- Verify atomically cập nhật Payment, Order projection và reservation `FULFILLMENT`.
- Reject/expire hủy Order và release inventory/voucher đúng một lần.
- Submit–expiry và verify–reject race không tạo trạng thái lai.
- Public DTO/log/audit không lộ evidence path, signed URL hoặc credential.
- Storefront có proof upload; backoffice có queue/detail/evidence/verify/reject.
- Seed chạy lại không sửa operational state; Supabase smoke và `pnpm verify` xanh.

Không thuộc Slice 07: pickup/shipping fulfillment, CASH/COD completion, refund processing, payment gateway, Redis/queue, multi-replica scheduler, full demo scenarios và job ngoài deposit expiry.

## 2. Kiến trúc và interface

```text
OrdersModule
  ├── PaymentCoreModule
  └── OrderTransactionPortsModule

PaymentOperationsModule
  ├── PaymentCoreModule
  ├── OrderTransactionPortsModule
  ├── InventoryModule
  ├── VouchersModule
  ├── StorageModule
  ├── AuditModule
  └── NotificationsModule

SchedulerModule
  └── PaymentOperationsModule
```

- `PaymentCoreModule` giữ payment repository/policy và checkout gateway hiện có.
- `OrderTransactionPortsModule` không phụ thuộc Payments; export ownership policy, guest credential và payment-order gateway.
- `PaymentOperationsModule` sở hữu HTTP, upload, review, projection và expiry use case.
- `StorageModule` sở hữu provider binding dùng chung cho Media/Payments.
- `SchedulerModule` chỉ gọi expiry application command; không chứa Prisma/business rule.
- Không dùng `forwardRef`, nested transaction hoặc controller gọi Prisma.

### API — đúng 6 operation

| Method/path | Actor | Success |
|---|---|---|
| `POST /api/v1/payments/:paymentId/submit-proof` | CUSTOMER owner hoặc guest credential | `200 PaymentPublicDto` |
| `GET /api/v1/backoffice/payments` | EMPLOYEE/ADMIN | Paginated review queue |
| `GET /api/v1/backoffice/payments/:id` | EMPLOYEE/ADMIN | Review detail |
| `GET /api/v1/backoffice/payments/:id/evidence-url` | EMPLOYEE/ADMIN | Signed URL ≤300 giây |
| `POST /api/v1/backoffice/payments/:id/verify` | EMPLOYEE/ADMIN | Review result |
| `POST /api/v1/backoffice/payments/:id/reject` | EMPLOYEE/ADMIN | Review result |

OperationId: `submitPaymentProof`, `listBackofficePayments`, `getBackofficePayment`, `getPaymentEvidenceUrl`, `verifyPayment`, `rejectPayment`.

Public payment projection có payment/order code, purpose/method/status, expected/authorized received amount, transfer instructions/QR, expiry/submission/SLA/overdue và rejection reason. Không trả evidence location, signed URL, reviewer hoặc internal note.

Backoffice query hỗ trợ `status`, `purpose`, `method`, `reviewOverdue`, `orderNumber`, submission range, pagination và sort allowlist `submittedAt|expiresAt|createdAt|expectedAmount`; mặc định `UNDER_REVIEW`, tie-breaker `id`.

## 3. Database, transaction và failure policy

Không sửa baseline hoặc thêm bảng/cột. Forward migration bổ sung:

- Evidence bucket/path pair và object path thuộc `payments/{paymentId}/...`.
- Conditional lifecycle constraint cho `BANK_TRANSFER/DEPOSIT`, không chặn CASH/COD tương lai.
- Index `(status, expires_at, id)` cho expiry batch.
- Exact preflight trước deploy; row ngoài state hợp lệ làm dừng rollout.

Lock order thống nhất: `Order → Payment → reservation/inventory targets theo ID → Voucher`.

### Submit proof

1. Authorize owner/state/deadline trước multipart parsing.
2. Validate đúng một file, magic bytes/MIME, raster bằng `sharp`, PDF bằng `pdf-lib`.
3. Upload `rephone-private/payments/{paymentId}/{uuid}.{ext}`, `upsert=false`.
4. Serializable transaction recheck ownership và `now < expiresAt`.
5. Attach evidence; set `customerDeclaredAt=submittedAt=now`.
6. Payment `AWAITING_PROOF → UNDER_REVIEW`; reservation `DEPOSIT → REVIEW`, `expiresAt=null`.
7. Audit trong transaction; email sau commit.

Hai submit chỉ một object attach; loser cleanup và trả projection hiện hành. DB/state fail sau upload gọi delete best-effort; delete fail log `storage_orphan_candidate`.

### Verify/reject/expiry

- Verify cần evidence, positive Money và `receivedAmount >= depositRequired`; amount khác expected cần note 5–500. Recompute paid/refunded/balance/payment status bằng BigInt, xác nhận Order và chuyển reservation `REVIEW → FULFILLMENT` trong một commit.
- Reject cần reason 5–500; giữ evidence lịch sử, terminalize Payment, cancel Order/Fulfillment, release reservation/stock/voucher.
- Replay cùng terminal action chỉ trả current result nếu cùng actor và normalized payload; không audit/email lại. Terminal khác trả `PAYMENT_ALREADY_REVIEWED`.
- `expireDepositProofs` chạy mỗi phút UTC, process mutex, batch config, một Serializable transaction/order. Chỉ `AWAITING_PROOF` quá hạn; Payment `EXPIRED`, reservation `EXPIRED`, Order/Fulfillment cancelled và voucher released. `UNDER_REVIEW` không bị expire.

## 4. Security, UI và observability

- Bearer có precedence; invalid Bearer 401, staff không fallback guest.
- Non-owner/guest token sai nhận `ORDER_NOT_FOUND`.
- Cookie-auth submit cần exact Origin + `X-Rephone-CSRF: 1`; Bearer/header token không cần CSRF.
- CUSTOMER upload 20/10 phút; guest thêm 10/phút theo IP+payment; backoffice command/signed URL 120/phút/actor.
- Evidence URL chỉ EMPLOYEE/ADMIN, audit trước response, TTL `min(config, 300)`, `no-store`; PDF dùng download disposition.
- Audit actions: `payment.proof_submitted`, `payment.evidence_viewed`, `payment.verified`, `payment.rejected`, `payment.expired`; không lưu path/URL/full bank/contact.
- Email `payment.proof_submitted`, `payment.verified`, `payment.rejected` sau commit; expiry dùng order-cancelled. SMTP fail không rollback.

UI tối thiểu:

- `/orders/[orderNumber]`: proof status/deadline/SLA, file picker, retry và refetch; không cho customer đọc evidence.
- `/backoffice/payments`: queue/filter/overdue.
- `/backoffice/payments/[id]`: safe detail, signed evidence, verify/reject.
- Role gate, loading/error, double-submit guard, focus/label/aria-live và mobile width cơ bản.

## 5. Work packages và commit strategy

| WP | Nội dung | Commit |
|---|---|---|
| 0 | Plan chi tiết và in-progress | `docs(plan): detail slice 07 implementation` |
| 1 | Migration/preflight/seed safety | `feat(db): enforce payment evidence invariants` |
| 2 | Core/ports/storage modules | `refactor(api): expose payment operation ports` |
| 3 | Secure proof submission | `feat(api): add payment proof submission` |
| 4 | Review queue/detail/signed URL | `feat(api): add payment review queries` |
| 5 | Atomic verify/reject | `feat(api): review deposit proofs atomically` |
| 6 | Expiry scheduler | `feat(api): expire unattended deposit proofs` |
| 7 | Lifecycle notifications | `feat(api): send payment lifecycle notifications` |
| 8 | OpenAPI/client | `chore(api): generate slice 07 contracts` |
| 9 | Owner upload UI | `feat(web): add deposit proof submission` |
| 10 | Staff review UI | `feat(web): add payment review backoffice` |
| 11 | Full invariant coverage | `test(payments): cover slice 07 invariants` |
| 12 | Supabase smoke | `test(payments): add Supabase slice 07 smoke` |
| 13 | Rollout/completion | `docs(plan): mark slice 07 complete` |

Mỗi concern chạy gate liên quan và push riêng. Không stage `apps/web/next-env.d.ts`; không sửa `docs/decisions`.

## 6. Test, rollout và rollback

- Unit: file/PDF, access/CSRF, deadline/SLA, money/note, projection, scheduler mutex, notifications.
- Integration: constraints/index, atomic submit/verify/reject/expire, rollback, stock/voucher, seed safety và safe audit.
- Concurrency dùng barrier: dual submit, submit-vs-expiry, verify-vs-reject, expiry replay và cancel-vs-submit.
- E2E/security: 6 routes, ownership/roles, multipart, 413/415/503, signed URL, query allowlist, replay/no-store.
- Contract: tổng 87 operation, operationId unique, security OR, multipart schema và client không drift.
- Regression: Slice 01–06 xanh; public Order không lộ evidence; cancel bị chặn UNDER_REVIEW.

Quality gate: format → lint → typecheck → unit → DB prepare → integration → E2E → OpenAPI → client → build → `pnpm verify`.

Supabase rollout: check target/private bucket → backup/preflight → migrate → API/web một scheduler replica → tạo shipping proof → seed hai lần khi UNDER_REVIEW → verify → customer cancel exact smoke order → reject flow → expiry bằng injected clock → invariant/log audit → full verify.

Rollback không down migration/xóa evidence. Dừng scheduler trước rollback; Payment thật UNDER_REVIEW phải resolve hoặc forward-fix. Chỉ cleanup orphan theo exact verified bucket/path.

## 7. Kết quả nghiệm thu

- Migration Slice 07 đã deploy forward-only; preflight trước và sau smoke đều không có vi phạm, lần deploy kiểm tra lại không còn migration pending.
- Supabase Storage có bucket `rephone-private` ở chế độ private, giới hạn 10 MiB và đúng bốn MIME được phép.
- OpenAPI có 87 operation/87 operationId duy nhất; đủ 6 operation Slice 07, UUID path params, multipart schema, security OR và generated client không drift.
- `pnpm verify` xanh với 79 unit test, 16 integration test, 54 API E2E và production build cho API/Web.
- Smoke Supabase thật đã xác nhận upload/signed read/verify/reject/replay, refund obligation, release reservation/voucher/stock, audit redaction và reseed hai lần không đổi operational state.
- Scheduler một replica đã chạy một batch thật, expire đúng payment `AWAITING_PROOF` quá hạn và ghi structured job log; expiry/race/replay còn được bao phủ bằng fixture cô lập để không time-travel database dùng chung.
- Runtime web trả thành công `/login`, `/orders`, `/backoffice/payments`; browser automation tích hợp không khả dụng trong phiên nghiệm thu nên interaction coverage dựa trên web tests, API E2E và HTTP production smoke.
- Không sửa `docs/decisions`; mỗi concern đã được commit/push riêng. Bước kế tiếp là Slice 08 — Pickup fulfillment.

## Tài liệu nguồn

- [Payment proof/review API](../api/payment-proof-and-review-endpoints.md)
- [Order/deposit requirements](../requirements/order-deposit-and-fulfillment.md)
- [File upload pipeline](../architecture/file-upload-pipeline.md)
- [State machines](../architecture/state-machines.md)
- [Transaction/concurrency](../architecture/transaction-and-concurrency.md)
- [Background jobs](../architecture/background-jobs.md)
- [Notifications](../architecture/notifications.md)
- [Sales data](../data-model/sales.md)
- [Testing strategy](../quality/testing-strategy.md)
