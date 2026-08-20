# Configuration và environment schema

Mọi cấu hình kỹ thuật lấy từ environment và được validate ngay khi process khởi động. Cấu hình nghiệp vụ có thể đổi khi chạy nằm trong `StoreSettings`; secret/provider credential tuyệt đối không lưu database.

## 1. File và precedence

- Root commit `.env.example` với placeholder an toàn, không commit `.env`, `.env.local`, `.env.test` hoặc secret thật.
- Local developer copy `.env.example` thành `.env`; Turbo truyền các biến đã allow-list cho app.
- Test dùng `.env.test` do developer/CI tạo từ secret store.
- Production/demo hosted dùng environment của platform, không copy file secret vào image.
- API gọi `loadConfig()` một lần và export typed config; module không gọi `process.env` trực tiếp.
- Web chỉ đọc biến `NEXT_PUBLIC_*` thực sự public. Mọi biến khác server-only.

## 2. API environment bắt buộc

| Biến | Ví dụ local | Quy tắc |
|---|---|---|
| `NODE_ENV` | `development` | `development`, `test`, `production` |
| `API_PORT` | `4000` | 1..65535 |
| `API_PUBLIC_URL` | `http://localhost:4000` | Absolute URL |
| `WEB_PUBLIC_URL` | `http://localhost:3000` | Absolute URL, dùng link email |
| `WEB_ORIGIN` | `http://localhost:3000` | Một origin P0; CORS exact match |
| `DATABASE_URL` | `postgresql://rephone:rephone@localhost:5432/rephone_dev` | Runtime URL; bắt buộc |
| `DIRECT_URL` | giống `DATABASE_URL` | CLI migration URL; bắt buộc, local có thể giống runtime |
| `JWT_ACCESS_SECRET` | placeholder | Random >= 32 bytes; không dùng default ngoài test |
| `IDENTIFIER_ENCRYPTION_KEY` | base64 placeholder | Decode đúng 32 bytes cho AES-256-GCM |
| `IDENTIFIER_HMAC_KEY` | base64 placeholder khác | Decode >= 32 bytes; không trùng encryption key |
| `SUPABASE_URL` | project URL | HTTPS ngoài local stub |
| `SUPABASE_SERVICE_ROLE_KEY` | placeholder | Server-only |
| `SUPABASE_PUBLIC_BUCKET` | `rephone-public` | Catalog/product/unit media |
| `SUPABASE_PRIVATE_BUCKET` | `rephone-private` | Payment/refund/after-sales evidence |
| `SUPABASE_STORE_BUCKET` | `rephone-store-assets` | Bank QR public |
| `SMTP_HOST` | `localhost` | Mailpit local |
| `SMTP_PORT` | `1025` | 1..65535 |
| `SMTP_SECURE` | `false` | Boolean strict |
| `MAIL_FROM` | `rePhone <no-reply@rephone.local>` | Mailbox hợp lệ |

SMTP auth có điều kiện: `SMTP_USER` và `SMTP_PASSWORD` cùng null ở Mailpit local hoặc cùng tồn tại ở hosted provider; không cho chỉ có một biến. `SMTP_REQUIRE_TLS=true` ở hosted khi provider dùng STARTTLS; local default false.

Nếu dùng Supabase PostgreSQL sau này: API persistent ưu tiên direct URL khi host có IPv6 hoặc Supavisor session-mode port 5432 khi cần IPv4; `DIRECT_URL` cho Prisma CLI/migration ưu tiên direct URL, nhưng có thể dùng session-mode nếu môi trường không có IPv6. Transaction-mode port 6543 chỉ dành serverless/short-lived runtime, không phải topology P0 mặc định. Chưa có URL thật không cản scaffold local; thay URL chỉ qua environment.

## 3. API environment có default

| Biến | Default | Ý nghĩa |
|---|---:|---|
| `LOG_LEVEL` | `debug` dev, `info` production | `trace`..`fatal` |
| `DB_POOL_MAX` | `10` | Pool `pg`; test `5` |
| `DB_CONNECTION_TIMEOUT_MS` | `5000` | Không giữ default vô hạn của `pg` |
| `DB_IDLE_TIMEOUT_MS` | `10000` | Idle connection timeout |
| `JWT_ACCESS_TTL_SECONDS` | `900` | 15 phút; khớp token contract |
| `JWT_ISSUER` | `rephone-api` | Verify exact `iss` |
| `JWT_AUDIENCE` | `rephone-web` | Verify exact `aud` |
| `AUTH_REFRESH_TTL_DAYS` | `7` | Absolute session lifetime; khớp token contract |
| `ARGON2_MEMORY_KIB` | `65536` | 64 MiB; benchmark trước demo hosted |
| `ARGON2_TIME_COST` | `3` | Số iteration |
| `ARGON2_PARALLELISM` | `1` | Phù hợp API replica nhỏ |
| `PASSWORD_RESET_TTL_MINUTES` | `30` | Khớp auth contract |
| `EMPLOYEE_INVITE_TTL_HOURS` | `24` | Khớp auth contract |
| `GUEST_CART_TTL_DAYS` | `30` | Khớp commerce model |
| `SIGNED_URL_TTL_SECONDS` | `300` | Private evidence only |
| `SCHEDULER_ENABLED` | `true` | `false` ở process test thông thường |
| `SCHEDULER_BATCH_SIZE` | `100` | 1..500 |
| `REQUEST_BODY_LIMIT` | `1mb` | JSON; multipart có limit riêng |
| `TRUST_PROXY` | `false` | Chỉ bật khi thật sự sau reverse proxy đã biết |
| `APP_VERSION` | `dev` | Commit/tag dùng trong startup log, không chứa secret |

Timeout nghiệp vụ như phí ship, số tiền cọc, pickup hold, proof/review window và warranty days không nằm trong environment; chúng thuộc `StoreSettings` để Admin cập nhật và được snapshot đúng nơi.

## 4. Web environment

| Biến | Ví dụ | Quy tắc |
|---|---|---|
| `NEXT_PUBLIC_API_BASE_URL` | `http://localhost:4000/api/v1` | Public, absolute URL |
| `API_INTERNAL_BASE_URL` | `http://localhost:4000/api/v1` | Server-side Next; không prefix `NEXT_PUBLIC_` |

Web không có database URL, service-role key, SMTP, JWT secret, encryption/HMAC key. Public Supabase URL cũng không cần trong P0 vì upload đi qua NestJS.

## 5. Cookie và HTTP constants

Đặt trong source constants, không cần environment:

| Mục | Giá trị |
|---|---|
| Refresh cookie | `rephone_refresh` |
| Guest cart cookie | `rephone_guest_cart` |
| CSRF proof header | `X-Rephone-CSRF: 1` |
| Request ID header | nhận/trả `X-Request-Id` |
| API prefix | `/api/v1` |

Production cookie: `HttpOnly`, `Secure`, `SameSite=Lax`; local bỏ `Secure` vì HTTP. Refresh cookie path `/api/v1/auth`, max-age/expiry 7 ngày. Guest cart cookie path `/api/v1`, max-age/expiry 30 ngày. Không set `Domain` nếu không bắt buộc và không cho cấu hình cookie name tùy ý để tránh client/server drift.

## 6. StoreSettings mặc định seed

| Field | Demo default |
|---|---|
| `key` | `STORE` |
| `storeName` | `rePhone` |
| `currency` | `VND` |
| `timezone` | `Asia/Ho_Chi_Minh` |
| `defaultShippingFee` | `30000` |
| `shippingDepositAmount` | `500000` (> 0) |
| `pickupHoldMinutes` | `1440` |
| `depositProofWindowMinutes` | `30` |
| `depositReviewWindowMinutes` | `1440` |
| `defaultWarrantyDays` | `90` |
| `defaultWarrantyTerms` | `Bảo hành lỗi phần cứng theo kết quả kiểm định; không gồm rơi vỡ, vào nước hoặc hao mòn pin.` |

Store phone/address và ba bank field lấy từ các biến `SEED_STORE_*`/`SEED_BANK_*` ở seed run; nếu thiếu trong local demo thì dùng placeholder giả được khóa tại seed scenarios. Không dùng tài khoản ngân hàng thật trong repository.

## 7. Startup validation

API fail-fast với message chỉ nêu tên biến/lý do, không in value. Production từ chối chạy nếu secret là placeholder, origin không HTTPS, `SMTP_SECURE`/port vô lý hoặc storage bucket trùng public/private. Readiness chỉ thành công sau khi config hợp lệ, Prisma kết nối và migration đã được deploy.

## Liên kết

- [StoreSettings data dictionary](../data-model/system.md)
- [Auth token transport](../api/auth-token-transport.md)
- [File upload pipeline](file-upload-pipeline.md)
- [Local development và deployment](../operations/local-development-and-deployment.md)
- [Supabase + Prisma connection guide](https://supabase.com/docs/guides/database/prisma)
