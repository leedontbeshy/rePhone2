# Observability và health

P0 dùng structured logs, request ID, AuditLog và health endpoints. Không dựng Prometheus/Grafana/ELK trong tháng đầu; log phải đủ để tái hiện demo và chẩn đoán request/job lỗi.

## 1. Request correlation

- Nhận `X-Request-Id` nếu là UUID/ULID hợp lệ và dài tối đa 64; nếu không, tạo UUIDv7 mới.
- Trả `X-Request-Id` ở mọi response, đồng thời đưa `requestId` vào error envelope.
- Request ID đi qua application context, AuditLog và provider log.
- Job có run ID riêng; command do job chạy dùng cùng run ID + resource context.

## 2. Log format

API dùng Pino JSON. Field chuẩn:

| Field | Ý nghĩa |
|---|---|
| `timestamp`, `level`, `service`, `environment` | Metadata process |
| `event` | Stable event name |
| `requestId` | Correlation |
| `method`, `route`, `statusCode`, `durationMs` | HTTP summary; route template, không phải raw URL |
| `actorType`, `actorId` | Actor ID khi authorized; không email/token |
| `resourceType`, `resourceId` | Khi có business resource |
| `errorCode`, `errorType` | Domain/infrastructure category |
| `job`, `runId`, counters | Scheduled job |

Development có pretty transport; test mặc định `silent` trừ failed test; production JSON stdout.

## 3. Redaction

Pino redact/remove ít nhất:

- `authorization`, cookie/set-cookie, password/currentPassword/newPassword.
- refresh/invite/reset/guest token, JWT, idempotency key value.
- Supabase service key, SMTP credential, encryption/HMAC key, database URL.
- raw IMEI/serial/EID, ciphertext/HMAC, full bank account.
- multipart bytes, evidence/object signed URL, shipping address body.

Không log toàn request/response body. Cho phép log allow-list như order ID, public number, state transition, amount digit string khi cần audit vận hành; không log customer note.

## 4. AuditLog khác application log

- AuditLog là lịch sử nghiệp vụ append-only: ai làm gì, resource nào, reason/before-after redacted.
- Application log là chẩn đoán kỹ thuật và có thể rotate/xóa.
- Không dựa application log để tính tiền/trạng thái; không đổ mọi GET vào AuditLog.
- Các action audit tối thiểu nằm trong data dictionary System.

## 5. Health endpoints

### Public probes

Hai probe public không nằm dưới `/api/v1` và không bọc business envelope:

| Endpoint | Kết quả | Check |
|---|---|---|
| `GET /health/live` | 200 `{ "status": "ok" }` | Process/event loop đang phục vụ |
| `GET /health/ready` | 200 hoặc 503 | Config hợp lệ, Prisma `SELECT 1`, migration đã deploy |

Storage, SMTP và internet không làm readiness fail vì chúng là dependency có graceful error cho từng use case. Readiness có timeout 2 giây, không lộ URL/version/credential. Health endpoint public nhưng rate-limit nhẹ ở reverse proxy nếu hosted.

### Snapshot quản trị

`GET /api/v1/backoffice/system/health` là endpoint riêng cho `ADMIN`, dùng access token, response envelope `{ "data": ... }` và `Cache-Control: no-store`. Nó không thay public probe hay readiness gate; đây là ảnh chụp chẩn đoán cho màn hình vận hành.

Các probe chạy song song, mỗi dependency có timeout 2 giây. Snapshot chỉ trả trạng thái ổn định (`healthy`, `degraded`, `unavailable`, `not_configured`), reason code, thời lượng, uptime/version API đã sanitize, số migration applied/incomplete và thời điểm quan sát. Ý nghĩa từng thành phần:

| Thành phần | Probe | Diễn giải |
|---|---|---|
| API | Process hiện tại | Process đang trả snapshot; hiển thị uptime, version an toàn và thời lượng request. |
| Database | Query read-only tới PostgreSQL và `_prisma_migrations` | `unavailable` nghĩa là không đọc được database; migration chưa hoàn tất hoặc chưa có migration applied làm snapshot `degraded`. |
| Storage | Read-only bucket-list qua provider | Cho biết Supabase Storage có phản hồi cho thao tác metadata; không liệt kê bucket/object trong response. |
| Mail | SMTP transport verification, không gửi mail | Cho biết có thể thiết lập transport gửi mail; `not_configured` khi môi trường không cấu hình provider. |

Storage/SMTP `unavailable` hoặc `not_configured` làm snapshot chi tiết `degraded`, nhưng không làm `/health/ready` fail. Snapshot không trả provider URL/project reference, bucket name, SMTP host/user, key, connection string, biến môi trường, lỗi SQL/stack trace, địa chỉ nội bộ hay dữ liệu khách hàng.

## 6. Error reporting và alert P0

- Unhandled exception log `fatal/error` với stack server-side và request ID; response luôn generic `INTERNAL_ERROR`.
- Expected domain 4xx log `info` hoặc `warn`, không log stack.
- Serialization/deadlock retry log `warn` với attempt; exhausted log `error`.
- Job/provider failure log theo schema riêng.
- Demo/local quan sát stdout + Mailpit + backoffice Audit. Sentry là P1, chỉ thêm khi deploy public đủ lâu để cần alert.

## 7. Retention

- Local log không commit; Docker log rotate `10m` x 3 file.
- Hosted demo giữ application logs tối đa 14 ngày nếu platform hỗ trợ.
- AuditLog giữ suốt vòng đời dữ liệu đồ án; không có delete endpoint P0.
- IP/user-agent là dữ liệu nhạy cảm: chỉ lưu khi phục vụ security/audit và rút gọn theo data dictionary.

## 8. Acceptance tests

- Error response/header/log/AuditLog cùng request ID.
- Redaction test không còn token/password/raw identifier trong captured log.
- Readiness 503 khi database mất kết nối và phục hồi 200.
- Domain conflict không tạo stack leak trong response.
- Job completion log có scanned/succeeded/noop/failed/duration.

## Liên kết

- [Response contract](../api/response-contract.md)
- [Error catalog](../api/error-catalog.md)
- [System data dictionary](../data-model/system.md)
- [Background jobs](background-jobs.md)
