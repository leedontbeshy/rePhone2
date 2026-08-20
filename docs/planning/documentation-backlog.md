# Documentation readiness

Tài liệu này là bảng kiểm độ sẵn sàng trước khi code, không còn là danh sách câu hỏi thiết kế. Core/backend P0 đã được khóa ở mức đủ triển khai; các mục hoãn được ghi rõ để không lẫn vào tháng đầu.

## 1. Readiness matrix

| Nhóm | Trạng thái | Nguồn chính |
|---|---|---|
| Product scope, role, order/deposit/fulfillment, warranty | Ready | `requirements/*` |
| Modular monolith, module boundary, state machine | Ready | `architecture/system-architecture.md`, `backend-modules.md`, `state-machines.md` |
| Transaction/concurrency/checkout/cancel/fulfillment/refund | Ready | `architecture/*transaction*.md`, fulfillment/refund docs |
| 28-table data dictionary | Ready | `data-model/*` |
| PostgreSQL/Prisma physical implementation | Ready | `architecture/database-implementation.md` |
| Auth/security/token/file policy/threat model | Ready | architecture security docs + API auth contracts |
| Full P0 endpoint surface, response/error/query conventions | Ready | `api/*`, đặc biệt `endpoint-inventory.md` |
| OpenAPI → typed frontend client | Ready | `api/openapi-and-client.md` |
| Backoffice catalog/inventory/order/payment/refund | Ready | API backoffice contracts |
| Voucher, employee, settings, audit, warranty/after-sales | Ready | API contracts tương ứng |
| Environment/toolchain/monorepo | Ready | `architecture/configuration.md`, `development/toolchain-and-monorepo.md` |
| Jobs/email/observability | Ready | `architecture/background-jobs.md`, `notifications.md`, `observability.md` |
| Local/demo deployment và backup/restore | Ready | `operations/local-development-and-deployment.md` |
| Test/concurrency acceptance | Ready | `quality/testing-strategy.md` |
| Cross-document consistency audit | Ready | `quality/documentation-consistency-audit.md` |
| Seed/demo flow | Ready | `planning/seed-and-demo-scenarios.md` |
| 4-week implementation order | Ready | `planning/implementation-roadmap.md` |
| Detailed UI/UX | Deferred | Thiết kế sau backend/core; không chặn scaffold API |
| SePay/carrier integration | Deferred | P1/P2; manual flow là contract P0 |

## 2. Definition of ready đã đạt

Backend có thể scaffold khi:

1. Người triển khai bắt đầu từ [docs index](../readme.md), đọc scope + architecture + data/API contract của slice.
2. Schema 28 bảng được tạo theo data dictionary và physical constraint guide.
3. Mỗi endpoint dùng named use case, permission/error/transaction đã mô tả; không suy diễn generic status CRUD.
4. Environment có placeholder local; DB URL production/Supabase có thể cấp sau.
5. Test acceptance/concurrency của slice được viết cùng implementation.
6. OpenAPI/generated client và docs được cập nhật cùng code.

Tất cả điều kiện trên đã có tài liệu nguồn; “chưa có code” không còn được hiểu là “chưa có quyết định”.

## 3. Deferred, không phải blocker

- Wireframe/design system/animation và browser coverage rộng.
- SePay webhook, reconciliation và provider-specific security.
- Carrier quote/create/track webhook và redelivery/multi-attempt.
- Email verification/MFA/custom permissions.
- Durable notification outbox/queue, Redis, multi-replica scheduler/rate limit.
- Multi-store allocation, repair part/order, accessory acquisition cost, BI/analytics.
- Production HA/SLA/WAF/SIEM/advanced monitoring.

Khi kéo một mục deferred vào scope, phải cập nhật requirement, architecture/data/API/test/roadmap liên quan trước hoặc cùng commit. Không sửa ngược các quyết định lịch sử trong `docs/decisions`.

## 4. Quy tắc duy trì docs khi code

- Markdown business/architecture giải thích behavior; OpenAPI xác nhận contract máy đọc được; code/test chứng minh implementation.
- Nếu code và docs lệch, task chưa done.
- Thay field/status/constraint/path/error cần tìm toàn `docs` và cập nhật mọi nơi dùng nó.
- Chạy link/consistency audit trước checkpoint tuần và release demo.
- ADR/decision log hiện hữu được giữ làm lịch sử; tài liệu hiện hành ngoài `decisions` là nơi hợp nhất lựa chọn triển khai mới của giai đoạn này.

## Liên kết

- [Docs index](../readme.md)
- [Implementation roadmap](implementation-roadmap.md)
- [Testing strategy](../quality/testing-strategy.md)
- [Documentation consistency audit](../quality/documentation-consistency-audit.md)
- [Endpoint inventory](../api/endpoint-inventory.md)
