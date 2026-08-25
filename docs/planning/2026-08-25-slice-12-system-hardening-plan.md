# Kế hoạch triển khai Slice 12 — System Administration & Release Hardening

> Trạng thái: 🚧 IN PROGRESS trên branch `feat/slice-12-system-hardening` từ baseline Slice 11 `444636d`.<br>
> Baseline: Slice 11 có 143 OpenAPI operation; Slice 12 thêm đúng 17 operation và phải đạt 160.<br>
> Phụ thuộc: toàn bộ Slice 01–11 đã hoàn thành.<br>
> Không sửa `docs/decisions`; behavior hiện hành theo precedence tại [docs index](../readme.md#nguồn-sự-thật-khi-có-trùng-nội-dung).

## 1. Mục tiêu, phạm vi và quyết định đã khóa

Slice 12 hoàn tất P0 bằng cách triển khai quản trị employee/customer, StoreSettings, AuditLog query, các scheduled job còn thiếu, notification delivery dùng chung, utility UI và release hardening. Hoàn thành khi:

- OpenAPI tăng chính xác `143 → 160`, generated client không drift.
- ADMIN quản lý employee/settings/audit; EMPLOYEE chỉ đọc customer projection an toàn.
- Disable/suspend revoke session/token nguyên tử mà không sửa lịch sử Order, Refund, Warranty hoặc AfterSales.
- Settings dùng optimistic concurrency; snapshot Order/Payment/Reservation/Warranty cũ bất biến.
- AuditLog append-only và redacted ở write/read boundary.
- Đủ năm scheduled job UTC, overlap guard và idempotent handler.
- Email gửi sau commit, tối đa hai attempts trong ba giây, failure không rollback.
- Utility UI, six-scenario demo, Playwright critical flow, Supabase/Mailpit smoke và release rehearsal đều xanh.
- `pnpm verify` và `pnpm test:browser` xanh; root `plan.md` đánh dấu P0 hoàn thành.

Không thuộc Slice 12: MFA/email verification, quản lý ADMIN, impersonation, audit export, Redis/queue/outbox, distributed scheduler, multi-replica, multi-store, monitoring stack đầy đủ, payment/carrier integration hoặc design system hoàn chỉnh.

Quyết định contract:

1. Thêm đúng 17 HTTP operation; `/health/live`, `/health/ready` và auth invitation endpoint hiện có không đếm lại.
2. Chọn UI P0 cân bằng: utility UI tối thiểu cho employee, customer, settings, audit và một Playwright happy path.
3. `UserOperationsModule` tách khỏi `AuthModule`/`AccountsModule`; cross-module identity dùng port hẹp nhận transaction client.
4. `AuditModule` giữ append-only writer; `AuditOperationsModule` chỉ đọc và không tự tạo AuditLog khi GET.
5. Settings update/upload dùng compare-and-swap theo `expectedVersion`; không auto-merge.
6. Overdue payment review là structured log-only P0; không email, audit lặp hoặc tự transition.
7. PostgreSQL là source of truth; một API replica kiêm scheduler; Storage/SMTP nằm ngoài transaction.
8. One-time auth link dùng URL fragment; frontend xóa fragment trước request và không lưu localStorage.

## 2. Kiến trúc và interface

```text
AppModule
├── UserOperationsModule
│   ├── EmployeeController
│   ├── CustomerController
│   ├── EmployeeIdentityGateway
│   ├── AuditWriter
│   └── NotificationsModule
├── SettingsModule
│   ├── PublicStoreController
│   ├── BackofficeSettingsController
│   ├── CheckoutSettingsReader
│   ├── StorageModule
│   └── AuditWriter
├── AuditModule
├── AuditOperationsModule
├── NotificationsModule
└── SchedulerModule
    ├── CartModule
    ├── AuthModule
    ├── PaymentOperationsModule
    └── FulfillmentModule
```

- `AccountsModule` tiếp tục chỉ sở hữu self-service profile/address.
- Business job handler nằm ở module sở hữu dữ liệu; Scheduler chỉ cron adapter, mutex, run ID và counters.
- Không `forwardRef`, nested transaction, controller gọi Prisma hoặc provider network call trong transaction.
- DTO public/backoffice tách khỏi Prisma model; collection dùng pagination envelope chung.

### 2.1 API — 17 operation mới

| OperationId | Endpoint | Actor |
|---|---|---|
| `listBackofficeEmployees` | `GET /api/v1/backoffice/employees` | ADMIN |
| `createBackofficeEmployee` | `POST /api/v1/backoffice/employees` | ADMIN |
| `getBackofficeEmployee` | `GET /api/v1/backoffice/employees/:id` | ADMIN |
| `updateBackofficeEmployee` | `PATCH /api/v1/backoffice/employees/:id` | ADMIN |
| `resendEmployeeInvitation` | `POST /api/v1/backoffice/employees/:id/resend-invitation` | ADMIN |
| `disableEmployee` | `POST /api/v1/backoffice/employees/:id/disable` | ADMIN |
| `enableEmployee` | `POST /api/v1/backoffice/employees/:id/enable` | ADMIN |
| `listBackofficeCustomers` | `GET /api/v1/backoffice/customers` | EMPLOYEE/ADMIN |
| `getBackofficeCustomer` | `GET /api/v1/backoffice/customers/:id` | EMPLOYEE/ADMIN |
| `suspendCustomer` | `POST /api/v1/backoffice/customers/:id/suspend` | ADMIN |
| `activateCustomer` | `POST /api/v1/backoffice/customers/:id/activate` | ADMIN |
| `getPublicStore` | `GET /api/v1/store` | Public |
| `getBackofficeSettings` | `GET /api/v1/backoffice/settings` | ADMIN |
| `updateBackofficeSettings` | `PATCH /api/v1/backoffice/settings` | ADMIN |
| `uploadBackofficeBankQr` | `POST /api/v1/backoffice/settings/bank-qr` | ADMIN |
| `listBackofficeAuditLogs` | `GET /api/v1/backoffice/audit-logs` | ADMIN |
| `getBackofficeAuditLog` | `GET /api/v1/backoffice/audit-logs/:id` | ADMIN |

Create employee trả `{ employee, deliveryStatus }`; resend trả `{ employeeId, deliveryStatus }`; enable trả authoritative `EmployeeDetailDto`. Private responses/errors dùng `Cache-Control: no-store`.

### 2.2 UI tối thiểu

- `/backoffice/employees`: list/create/update/resend/disable/enable.
- `/backoffice/customers`: list/detail; ADMIN có suspend/activate.
- `/backoffice/settings`: settings form, stale-version alert và QR upload.
- `/backoffice/audit-logs`, `/backoffice/audit-logs/[id]`.
- `/forgot-password`, `/reset-password`, `/accept-invitation`.
- Header theo role; generated client, double-submit guard, focus error, label, `aria-live` và mobile width cơ bản.

## 3. Database, transaction, security và jobs

### 3.1 Forward migration

Không sửa baseline và không thêm bảng/cột. Forward migration:

- Bổ sung StoreSettings nonblank và bounds: minutes `1..10080`, warranty days `0..3650`.
- Giữ singleton `STORE`, VND, Asia/Ho_Chi_Minh, money/bank/version/QR-pair invariant hiện có.
- Thêm lowercase SHA-256 shape check cho refresh/auth token hash.
- Thêm trigger chặn `UPDATE/DELETE` AuditLog.
- Thêm index cleanup AuthSession/AuthToken, audit action/actor/request và customer `lastLoginAt`.
- Không bật `pg_trgm`; search P0 tiếp tục dùng explicit `ILIKE` query.

Preflight kiểm tra chính xác constraint/hash và dừng rollout khi có row lạ; không sửa dữ liệu tự động.

### 3.2 User lifecycle

Lifecycle command dùng Serializable transaction: lock User → validate role/state → update state/profile → create/invalidate invitation hoặc revoke session/token → audit → commit → email. Audit actions:

```text
employee.created
employee.updated
employee.invitation_resent
employee.disabled
employee.enabled
customer.suspended
customer.activated
```

Create employee tạo `EMPLOYEE/PENDING_VERIFICATION`, `passwordHash=null`, invitation digest TTL 24 giờ. Historical FK và nghiệp vụ không bị update khi disable/suspend.

### 3.3 Settings và QR

PATCH/QR dùng conditional update `key=STORE AND version=expectedVersion`, success tăng version đúng một. Conflict trả `SETTINGS_VERSION_CONFLICT` cùng current version. QR chỉ JPEG/PNG/WebP ≤5 MiB, server-generated path `bank-qr/{uuid}.{ext}`, `upsert=false`. Upload ngoài transaction; CAS loser/DB fail cleanup exact object best-effort; object cũ không xóa.

Audit settings chỉ lưu safe before/after; bank number dùng masked suffix, QR không lưu path.

### 3.4 Audit safety

`AuditWriter` và query serializer dùng cùng recursive denylist, loại password/token/cookie/secret, identifier/ciphertext/HMAC, evidence URL/path/digest, full address/contact và full bank account. List không có IP/user-agent; detail ADMIN-only trả dữ liệu bounded cần cho security investigation. Audit read chỉ structured security log để tránh recursion.

### 3.5 Scheduled jobs

| Job | UTC | Batch |
|---|---:|---:|
| `expireDepositProofs` | mỗi phút | 100 |
| `expirePickupHolds` | mỗi phút | 100 |
| `markExpiredGuestCarts` | mỗi giờ phút 17 | 200 |
| `purgeExpiredAuthRecords` | 02:15 hằng ngày | 500 |
| `reportOverduePaymentReviews` | mỗi 15 phút | 100 |

Mỗi job có process-local mutex, run ID, stable ordering và structured counters. Guest/auth cleanup dùng bounded conditional SQL và không audit từng record. Overdue reporter chỉ đọc snapshot SLA và log safe IDs. Business expiry tiếp tục một Serializable transaction/order, một record lỗi không chặn batch.

### 3.6 Notifications và observability

- Shared delivery service: tối đa hai attempt × 1,5 giây, tổng ≤3 giây.
- Chỉ gửi sau commit và khi transition mới; replay không gửi lại.
- Log event/resource/attempt/safe category, không recipient/token/body.
- `/health/ready` timeout hai giây, kiểm tra DB và migration failed/incomplete; Storage/SMTP không thuộc readiness.
- Error/header/log/AuditLog dùng cùng request ID; Swagger UI không public ở production.

## 4. Work packages và commit strategy

| WP | Nội dung | Commit |
|---|---|---|
| 0 | Plan chi tiết và trạng thái in-progress | `docs(plan): detail slice 12 system hardening` |
| 1 | Migration, preflight, indexes, trigger và seed preservation | `feat(db): enforce system administration invariants` |
| 2 | Shared mail retry/templates và fragment links | `refactor(api): centralize notification delivery` |
| 3 | Employee/customer API, lifecycle, revoke và audit | `feat(api): add employee and customer operations` |
| 4 | Public store, settings CAS và bank QR | `feat(api): add store settings operations` |
| 5 | Audit query/filter/redaction | `feat(api): expose append-only audit queries` |
| 6 | Ba maintenance job còn thiếu và scheduler runner | `feat(api): complete scheduled maintenance jobs` |
| 7 | Correlation, logger và readiness hardening | `chore(api): harden observability and readiness` |
| 8 | OpenAPI 160 và typed client | `chore(api): generate slice 12 contracts` |
| 9 | Utility UI và auth-link pages | `feat(web): add system administration utilities` |
| 10 | Unified six-scenario demo runner | `feat(demo): assemble stable demo scenarios` |
| 11 | Unit/integration/E2E/concurrency/performance | `test(system): cover slice 12 invariants` |
| 12 | Playwright và guarded release smoke | `test(system): add slice 12 release smoke` |
| 13 | Rollout và P0 completion | `docs(plan): mark slice 12 and p0 complete` |

Mỗi package chạy gate liên quan và push riêng. Không stage `apps/web/next-env.d.ts` và không sửa `docs/decisions`.

## 5. Test, demo và rollout

Test bắt buộc:

- Unit: normalization, role/state policy, CAS mapping, sanitizer, mail retry, scheduler mutex/counters.
- Integration: constraint/index/trigger, revoke atomic, QR cleanup, seed fingerprint và snapshot immutability.
- Concurrency bằng barrier: invite/resend/accept, disable/refresh, suspend/access, two-setting CAS, scheduler overlap/replay.
- E2E: đủ 17 routes, role matrix, pagination/filter/sort, SMTP failure, 409/413/415/429/503, no-store/redaction.
- Contract: đúng 160 operationId unique, security/multipart/error schema và generated client không drift.
- Browser: catalog → cart → shipping checkout → proof → review → shipment/deliver → completed order.
- Performance: normal API p95 <500 ms ở 20–50 concurrent user, list không N+1.
- Coverage: global API ≥75%; Slice 12 critical policies/transactions ≥90% branch.

Quality gates:

1. `pnpm format:check`
2. `pnpm lint`
3. `pnpm typecheck`
4. `pnpm test`
5. `pnpm test:db:prepare`
6. `pnpm test:integration`
7. `pnpm test:e2e`
8. `pnpm api:openapi`
9. `pnpm api:client`
10. `pnpm build`
11. `pnpm verify`
12. `pnpm test:browser`

`pnpm demo:scenarios` tạo/reuse `pickup-ready`, `shipping-awaiting-proof`, `shipping-under-review`, `shipping-in-transit`, `refund-processing`, `after-sales-inspecting` và ghi manifest gitignored. Script chỉ chạy trên database `_demo`/`_test`, không dùng direct SQL để transition business state.

Rollout: backup + restore rehearsal → preflight → `db:deploy` → API với scheduler tắt → Web → role/settings/audit/Mailpit/Supabase smoke → seed hai lần → demo/browser → gọi ba handler mới có kiểm soát → bật scheduler đúng một replica → full release verify → cập nhật plan/release SHA.

Rollback: tắt scheduler trước; không down migration/reset/sửa state bằng SQL; schema hardening và history đã commit được giữ; restore backup vào database mới khi migration/data lỗi; orphan chỉ cleanup bằng exact bucket/path đã xác minh.

## 6. Tài liệu nguồn

- [Employee/settings/audit endpoints](../api/employee-settings-audit-endpoints.md)
- [Identity/Auth data](../data-model/identity-auth.md)
- [System data](../data-model/system.md)
- [Background jobs](../architecture/background-jobs.md)
- [Notifications](../architecture/notifications.md)
- [Observability](../architecture/observability.md)
- [File upload pipeline](../architecture/file-upload-pipeline.md)
- [Roles and permissions](../requirements/roles-and-permissions.md)
- [Testing strategy](../quality/testing-strategy.md)
- [Seed/demo scenarios](seed-and-demo-scenarios.md)
- [Deployment runbook](../operations/local-development-and-deployment.md)
