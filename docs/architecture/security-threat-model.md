# Security threat model P0

Mục tiêu là bảo vệ tài khoản, tồn kho, tiền và định danh thiết bị trong một website demo có thể đưa vào portfolio. Đây không phải chứng nhận production; các rủi ro hoãn phải được nói rõ thay vì ngầm coi đã xử lý.

## 1. Tài sản và trust boundary

Tài sản quan trọng:

- Password/session/refresh/reset/invitation/guest access token.
- Role và quyền thao tác Admin/Employee.
- Giá, tồn kho, reservation, voucher quota, order/payment/refund projection.
- IMEI/serial/EID, địa chỉ, email/phone và private evidence.
- Provider secret, encryption/HMAC key, database credential.

Boundary:

```text
Untrusted browser
  → Next.js public application
  → NestJS API policy/validation boundary
  → PostgreSQL trusted state
  → Supabase Storage / SMTP external providers
```

Browser, header, cookie, filename, MIME, total, status và role claim từ client đều không được tin cậy.

## 2. Threat/mitigation matrix

| Threat | Mitigation P0 | Test/chứng cứ |
|---|---|---|
| Credential stuffing/brute force | Argon2id, generic login error, rate limit login/reset/invite, account disabled guard | auth e2e + rate-limit test |
| Refresh token theft/replay | HttpOnly/Secure/SameSite cookie, server hash, rotation family, reuse detection/revoke family | token rotation concurrency test |
| CSRF trên cookie endpoints | SameSite=Lax, exact Origin, custom `X-Rephone-CSRF`, content type check | cross-origin request bị chặn |
| XSS lấy access token | Access token chỉ memory, React escaping, không render raw HTML, CSP khi hosted | lint/manual browser smoke |
| IDOR/BOLA | Ownership policy cho mọi customer/guest resource; guest token hash + order scope | e2e actor A không đọc/sửa actor B |
| Privilege escalation/mass assignment | Server JWT role từ DB/session, guard + field allow-list DTO, Admin-only cost/settings/employee | permission matrix tests |
| Price/discount/shipping tampering | Server recompute từ catalog/settings; checkout preview không có authority; snapshot trong transaction | price-change/forged-total tests |
| Double-sell/oversell/quota race | Serializable transaction, conditional update, partial unique/check constraint, bounded retry | concurrency tests |
| Payment/refund forged transition | Named commands, expected state, staff permission, evidence private, AuditLog | state/permission/invariant tests |
| Malicious upload | Nest-mediated size/count allowlist, magic-byte detection, generated object path, no executable type | upload tests |
| Signed URL leakage | TTL 5 phút, authorized endpoint mới cấp, không log/cache public | ownership + expiry test |
| IMEI/serial disclosure/brute force | AES-256-GCM ciphertext + keyed HMAC + masked suffix; admin/employee reveal policy + audit | serializer/redaction/permission test |
| SQL injection | Prisma/parameterized raw SQL only; no string-built where/order | review + malicious filter test |
| Secret leak | typed env, `.gitignore`, server-only provider adapter, log redaction | secret scan/manual config test |
| Open redirect/tracking URL abuse | Validate `https` and allow safe URL construction; render external link rõ carrier | DTO validation test |
| Enumeration | Register/reset generic where needed; public codes not access secret; response timing không hứa tuyệt đối | auth contract test |
| DoS/resource exhaustion | body/multipart limit, pagination cap, query allow-list, rate limits, DB timeout/pool cap | boundary tests |

## 3. Authorization policy

- `ADMIN`: mọi backoffice P0, bao gồm employee, voucher, settings, cost, audit và suspend/activate customer.
- `EMPLOYEE`: vận hành catalog/inventory/order/payment/fulfillment/after-sales theo permission matrix; không xem cost, không quản lý employee/settings nhạy cảm.
- `CUSTOMER`: own account/address/cart/wishlist/order/warranty/after-sales.
- `GUEST`: cart cookie và order-scoped access secret; không wishlist/account endpoint.
- `SYSTEM`: chỉ internal job/application command, không phải role từ HTTP/JWT.

Guard role chưa đủ: use case luôn kiểm tra ownership, resource state và field-level rule. DTO public/backoffice riêng; response serializer allow-list riêng.

## 4. Cryptography và token

- Password Argon2id; parameter benchmark trên máy triển khai, mục tiêu khoảng 100–300 ms/hash và tối thiểu theo thư viện an toàn.
- Access JWT 15 phút, secret random >= 32 bytes; verify exact issuer/audience. Payload chỉ `sub`, role, session ID, issued/expiry, không PII.
- Refresh/reset/invite/guest token random tối thiểu 256 bit; database chỉ giữ SHA-256 digest vì token đã entropy cao.
- Identifier encrypt AES-256-GCM với nonce 12 byte ngẫu nhiên từng value, auth tag 16 byte và envelope base64url; lưu key version để rotate. Lookup dùng canonical type-prefixed HMAC-SHA-256 key riêng, lowercase hex.
- Không tự viết primitive crypto; dùng Node `crypto`/thư viện đã chọn và test vector/round-trip.

## 5. HTTP/browser policy

- Hosted dùng HTTPS; redirect HTTP ở reverse proxy.
- CORS exact `WEB_ORIGIN`, credentials true, không wildcard.
- Security headers qua Helmet: CSP phù hợp Next/assets, `frame-ancestors 'none'`, nosniff, referrer policy, HSTS chỉ hosted HTTPS.
- JSON body 1 MiB; multipart giới hạn theo file pipeline.
- Query pagination/filter/sort allow-list; không nhận raw SQL/order expression.
- Error production không trả stack, Prisma/provider error hoặc existence detail nhạy cảm.

## 6. Rate-limit baseline

Áp dụng sliding/fixed window bằng in-memory limiter vì một replica P0:

| Nhóm | Limit gợi ý |
|---|---|
| Login | 5/phút/IP + normalized email; 30/giờ |
| Register/reset/invite accept | 5/15 phút/IP hoặc token target |
| Refresh | 30/phút/session/IP |
| Guest order access | 10/phút/IP + order number |
| Upload | 20/10 phút/actor |
| Public catalog | 120/phút/IP |
| Backoffice mutation | 120/phút/actor |

Response 429 dùng error envelope và `Retry-After`. Multi-replica/Redis rate limit là P1.

## 7. Accepted risks P0

- Customer đăng ký chưa xác nhận email.
- Không antivirus/image sandbox; chỉ allowlist/magic bytes/size và ảnh raster.
- Không outbox/durable email delivery.
- Một API replica, in-memory rate limiter/scheduler mutex.
- Không MFA, custom permission, WAF, SIEM, HA hoặc automated penetration test.
- Supabase availability/backup ngoài phạm vi database backup local.

Các giới hạn này chấp nhận được cho demo sinh viên nhưng phải xử lý trước khi thu tiền thật hoặc public production.

## 8. Security checklist trước demo public

- Không còn placeholder/secret thật trong git và image.
- HTTPS, secure cookie, CORS/CSP đúng domain.
- Admin/employee demo password đổi khỏi seed mặc định; Supabase key rotate nếu từng lộ.
- Database không publish port ra internet; storage private bucket policy xác minh.
- `pnpm audit`/dependency update được review; dùng Next security patch baseline.
- Chạy auth/ownership/upload/concurrency/redaction e2e.
- Backup/restore test và emergency disable account đã thử.

## Liên kết

- [Authentication và security](authentication-and-security.md)
- [Auth token transport](../api/auth-token-transport.md)
- [Roles/permissions](../requirements/roles-and-permissions.md)
- [File upload](file-upload-pipeline.md)
- [Transaction/concurrency](transaction-and-concurrency.md)
