# Lộ trình triển khai 4 tuần

Kế hoạch ưu tiên backend/core, mỗi tuần kết thúc bằng một vertical slice chạy và test được. UI chi tiết không khóa trước; frontend chỉ làm mức tối thiểu để chứng minh luồng sau khi API tương ứng ổn định.

## 1. Nguyên tắc thực hiện

- Một người, phạm vi P0 cố định: iPhone cũ + phụ kiện, 3 role, manual deposit/shipping/refund/warranty.
- Không triển khai SePay, carrier API, microservice, Redis/queue, multi-store, custom role, email verification hay UI design system đầy đủ.
- Không scaffold cả hệ thống rồi để controller rỗng. Mỗi slice có migration + use case + endpoint + test + OpenAPI + docs.
- Mỗi ngày kết thúc bằng code build được; mỗi tuần có demoable checkpoint.
- Nếu trễ, cắt polish/P1 trước, không cắt invariant tiền/tồn kho/quyền.

## 2. Tuần 1 — Foundation, Auth, Catalog read

Mục tiêu: repository chạy sạch và public catalog đọc được từ database.

- Workspace/Turbo, config, Compose PostgreSQL/Mailpit, Pino, health, error envelope.
- Prisma schema 28 bảng + migration constraints/index baseline + idempotent seed.
- Auth register/login/refresh/logout/reset/invite, RBAC/ownership foundation.
- Public product list/detail/unit detail và generated OpenAPI client.
- Unit/integration tests cho config, schema constraints, auth rotation và catalog serialization.

Checkpoint: clean clone → setup → migrate/seed → login + browse catalog; `pnpm verify` xanh.

## 3. Tuần 2 — Backoffice inventory, Cart, Checkout

Mục tiêu: nhập/kiểm định máy và tạo order an toàn.

- Product/variant/media backoffice tối thiểu.
- iPhone intake, identifier crypto/masking, inspection checklist, availability; accessory stock/movement.
- Cart customer/guest, merge, wishlist và voucher validation.
- Stateless preview + atomic checkout + reservation + price reconfirmation/idempotency.
- Concurrency tests double-sell/oversell/voucher quota.
- Frontend tối thiểu cho catalog/cart/checkout nếu còn thời gian cuối tuần.

Checkpoint: Employee đưa một máy PASSED lên bán; guest checkout shipping/pickup không bán trùng.

## 4. Tuần 3 — Payment, Fulfillment, Refund, After-sales

Mục tiêu: đi hết vòng đời order và hậu mãi bằng API/backoffice tối thiểu.

- Proof upload/private evidence, payment review verify/reject/expiry.
- Pickup prepare/ready/cash complete; shipping tracking/handover/COD delivered/failed/returned.
- Cancel/refund create/process/complete; shipping fee override trước proof.
- Warranty issuance và after-sales receive/inspect/approve/reject/resolve.
- Scheduled jobs và transactional email templates.
- API e2e toàn flow, payment/fulfillment replay/concurrency tests.

Checkpoint: hai happy path pickup/shipping + một cancel/refund + một warranty case chạy end-to-end.

## 5. Tuần 4 — Integration, minimal UI, hardening và báo cáo

Mục tiêu: bản demo ổn định, có bằng chứng kỹ thuật đưa CV/đồ án.

- Nối frontend typed client cho customer portal/backoffice flows cần demo; responsive/accessibility cơ bản.
- Seed scenarios, Mailpit/Supabase smoke, audit/log/redaction/health.
- Fix contract drift, test flaky, query/index rõ ràng; run full security/checklist.
- Full demo Compose/hosted deployment nếu cần, backup/restore rehearsal.
- Chụp ERD/architecture/demo flow cho báo cáo; README setup và video/script demo.
- Buffer 2–3 ngày cuối chỉ sửa blocker, không thêm feature.

Checkpoint: clean rehearsal 12–15 phút, release checklist qua, không known P0 blocker.

## 6. Thứ tự vertical slices chi tiết

1. Foundation + health + DB.
2. Customer auth/account.
3. Public catalog.
4. Employee inventory intake/inspection.
5. Cart/wishlist/voucher.
6. Checkout/reservation/order read.
7. Deposit proof/review/expiry.
8. Pickup fulfillment.
9. Shipping/COD/tracking.
10. Cancel/refund.
11. Warranty/after-sales.
12. Settings/audit/jobs/email/demo hardening.

Mỗi slice chỉ bắt đầu khi dependency trước có test và contract ổn; frontend có thể theo sau API 1–2 slice.

## 7. Definition of done P0

- P0 endpoint inventory được triển khai và OpenAPI/client không drift.
- Migration từ database rỗng + seed hai lần thành công.
- Critical acceptance/concurrency/security tests qua.
- Hai role staff/admin và customer/guest permission không có known bypass.
- Money/inventory projection invariant được kiểm tra sau các flow.
- Local setup/runbook và demo scenario từ clean clone chạy được.
- Không secret/raw identifier/private object URL trong git/log/public DTO.
- Docs index liên kết đúng và phản ánh implementation.
- UI tối thiểu đủ demo; visual polish có thể ghi P1.

## 8. Cắt scope khi thiếu thời gian

Thứ tự cắt an toàn:

1. Browser automation rộng, animation/design polish.
2. Email template phụ, SEO nâng cao, dashboard statistic.
3. Backoffice CRUD tiện ích không nằm live demo.
4. Accessory warranty UI (API/data vẫn đúng).

Không cắt: auth/permission, inventory inspection/availability, atomic checkout/reservation, payment review, fulfillment balance, refund invariant, database migration/test và secret handling.

## 9. Backlog sau P0

- UI/UX design system và accessibility audit đầy đủ.
- SePay webhook/reconciliation.
- Carrier quote/create/tracking integration và redelivery attempts.
- Email verification, MFA, durable outbox/queue, multi-replica scheduler/rate limit.
- Multi-location allocation, accessory acquisition cost, repair parts/orders, analytics.

Các mục này không được âm thầm đưa vào sprint tháng đầu.

## Liên kết

- [Documentation readiness](documentation-backlog.md)
- [Testing strategy](../quality/testing-strategy.md)
- [Seed/demo scenarios](seed-and-demo-scenarios.md)
- [Endpoint inventory](../api/endpoint-inventory.md)
