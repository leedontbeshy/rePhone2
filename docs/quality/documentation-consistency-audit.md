# Documentation consistency audit

Audit này xác nhận bộ tài liệu hiện hành có thể dùng làm baseline triển khai P0. Ngày chạy gần nhất: **2026-08-18**. Phạm vi gồm toàn bộ Markdown trong `docs`; `docs/decisions` chỉ được đọc và băm kiểm tra, không chỉnh sửa.

## 1. Kết quả tự động

| Kiểm tra | Kết quả |
|---|---:|
| Tài liệu hiện hành ngoài decisions, gồm file audit này | 59 files |
| Tài liệu lịch sử đóng băng trong `docs/decisions` | 63 files |
| Relative Markdown link hỏng | 0 |
| Tài liệu hiện hành không được `docs/readme.md` lập chỉ mục | 0 |
| Entity data model | 28 |
| API operation trong endpoint table | 158 unique, 0 duplicate method/path |
| Stable API error code trong registry | 44 |
| Marker công việc/thiết kế chưa hoàn tất | 0 |

Phân bố 28 entity: Identity/Auth 4, Catalog/Inventory 9, Commerce 5, Sales 5, Warranty/After-sales 3, Settings/Audit 2. Các uppercase token ngoài error registry đã được phân loại là enum/status, warning code của cart, environment key hoặc ký hiệu HTTP; không có domain error được endpoint sử dụng nhưng chưa đăng ký.

## 2. Tính toàn vẹn decisions

- Số file: `63`.
- SHA-256 tổng hợp theo manifest `filename:fileSha256` đã sort, nối bằng LF:

```text
C7ABBEC3F0C0FEAEA38A29F9EA2A3FD7695D24DA41D3F3068ED7721BC401F8D5
```

Hash này khớp baseline trước đợt hoàn thiện. Không có file nào trong `docs/decisions` được thêm, sửa hoặc xóa. Decision log là lịch sử; contract triển khai hiện hành theo precedence tại [docs index](../readme.md).

## 3. Đối chiếu thủ công đã hoàn thành

| Trục đối chiếu | Nguồn so sánh | Kết quả |
|---|---|---|
| Scope và role | Product scope ↔ role matrix ↔ route/API actor | Khớp 3 role cố định; guest là access mode, không phải role DB |
| Account lifecycle | Auth architecture ↔ User fields ↔ auth/user APIs ↔ state machine | Khớp register ACTIVE, employee invitation, suspend/disable và session revoke |
| Catalog/inventory | Model ↔ inspection checklist ↔ lifecycle ↔ public/backoffice API | Khớp availability gate, identifier HMAC/encryption, unit media và stock counter |
| Cart/voucher | Commerce fields ↔ preview/checkout ↔ voucher API | Khớp no-reservation cart, deterministic VND allocation và quota lifecycle |
| Order/payment | Requirement ↔ state machine ↔ transaction ↔ fields/API | Khớp pickup/shipping, fixed fee, deposit snapshot, proof/review và zero-total edge |
| Fulfillment/refund | Fulfillment/cancel/refund transaction ↔ Shipment/Refund fields ↔ commands | Khớp CASH/COD, one shipment attempt, return-to-inspection và refund evidence |
| Warranty/after-sales | Requirement ↔ interval/status ↔ data/API | Khớp `[startAt,endAt)`, receive/decision/resolution và inventory effects |
| Security/files | Token transport ↔ threat model ↔ config ↔ upload contract | Khớp cookie/header/TTL, private bucket, signed URL và redaction |
| Runtime | Toolchain ↔ configuration ↔ local runbook ↔ testing | Khớp versions, ports, DB names, scripts, test DB và single-replica scheduler |
| Traceability | Endpoint inventory ↔ requirements matrix ↔ tests ↔ roadmap | Mọi capability P0 có owner, data, API và acceptance path |

## 4. Sai lệch đã được xử lý trong audit

- Chuẩn hóa local database thành `rephone_dev` ở URL, Compose, reset guard và backup.
- Pin version toolchain exact; bổ sung enum còn thiếu để dựng Prisma schema không phải đoán.
- Làm rõ refresh rotation giữ generation cũ để phát hiện token reuse.
- Định nghĩa payment summary `PAID` cho grand total 0 và không tạo Payment 0 đồng.
- Làm rõ deposit tại checkout và ngoại lệ giảm-only khi override phí ship trước proof.
- Đồng bộ inspection DRAFT partial checklist, availability gate và các transition write-off.
- Đồng bộ warranty expiry tại `now >= endAt`; bỏ warranty override không có API P0.
- Bổ sung actor/time/location lịch sử cho warranty void, refund terminal, after-sales receive và shipment return.
- Đồng bộ public catalog sort `fromPrice`, exact identifier lookup và warning/error classification.
- Làm rõ guest access link và bank snapshot được phép trong body email nhưng không trong log/subject.

## 5. Deferred có chủ đích, không phải mâu thuẫn

- UI/UX chi tiết, design system và browser coverage rộng.
- SePay, carrier API/webhook, redelivery và nhiều shipment attempt.
- Customer email verification, MFA, custom permission.
- Redis/queue/outbox, multi-replica scheduler/rate-limit và production HA.
- Repair-order/parts, multi-store, analytics và search engine chuyên dụng.

Các mục này không được tự đưa vào P0. Nếu đổi scope, cập nhật requirement, data, API, test và roadmap trong cùng thay đổi; không sửa lịch sử ở `docs/decisions`.

## 6. Gate cần chạy lại khi code

1. Kiểm tra mọi relative link và tài liệu mới đã được index.
2. Generate OpenAPI, xác nhận method/path/operationId không trùng và không drift Markdown.
3. Đếm đúng 28 Prisma model; chạy migration từ database rỗng và constraint tests.
4. Đối chiếu stable error code endpoint với registry.
5. Search toàn docs khi đổi status, field, default, TTL, bucket hoặc route.
6. Xác minh hash decisions vẫn đúng baseline trên.
7. Chỉ tuyên bố release-ready khi `pnpm verify`, seed hai lần và demo rehearsal đều qua.

## Liên kết

- [Docs index và source precedence](../readme.md)
- [Documentation readiness](../planning/documentation-backlog.md)
- [Requirements traceability](requirements-traceability.md)
- [Testing strategy](testing-strategy.md)
- [Endpoint inventory](../api/endpoint-inventory.md)
- [Database implementation](../architecture/database-implementation.md)
