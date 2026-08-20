# Thiết kế Slice 02 — Authentication & Account

> Trạng thái: Đã được xác nhận ngày 2026-08-20  
> Phạm vi: Slice 02 trong [`plan.md`](../../plan.md)  
> Nguồn sự thật: các contract trong `docs`; tài liệu này chỉ ghi lại quyết định thiết kế và cách triển khai.

## 1. Understanding summary

- Xây dựng nền tảng xác thực và tài khoản P0 cho khách hàng, đồng thời chuẩn bị application service cho invitation nhân viên.
- Người dùng chính là khách hàng đăng ký/đăng nhập và quản lý tài khoản; luồng nhân viên được public accept invitation, còn backoffice employee API hoàn chỉnh thuộc Slice 12.
- Hệ thống phải hỗ trợ refresh-token rotation, phát hiện reuse, thu hồi session tức thời và ownership cho profile/address.
- Access token chỉ tồn tại trong memory của web; refresh token chỉ đi qua cookie `HttpOnly` và database chỉ lưu token digest.
- Transaction và row locking phải bảo vệ refresh rotation, one-time token consumption và chuyển địa chỉ mặc định trước race condition.
- P0 không đưa Redis/queue, MFA, social login, email verification, session-management UI, multi-store hay microservice vào phạm vi.
- Hoàn thành khi contract API, OpenAPI, typed client, UI auth tối thiểu, seed/demo và test matrix của Slice 02 đều vượt quality gates.

## 2. Assumptions và non-functional requirements

### 2.1 Assumptions

- P0 chạy mô hình single-store, một API instance trong môi trường demo/acceptance; PostgreSQL là nguồn sự thật duy nhất cho identity và session.
- Rate limiter dùng interface với adapter in-memory. Nếu chạy nhiều API instance trước khi có Redis, quota không được tổng hợp toàn cụm; đây là giới hạn P0 được chấp nhận.
- Thời gian lưu và so sánh theo UTC; TTL access token là 15 phút, refresh session là 7 ngày, reset token là 30 phút và invitation token là 24 giờ.
- Schema hiện có cho `User`, `CustomerAddress`, `AuthSession`, `AuthToken` là baseline. Chỉ tạo corrective migration nếu khi triển khai phát hiện contract chưa được biểu diễn đầy đủ.
- Auth email được gửi sau khi transaction commit qua `MailProvider`. Lỗi provider được log và không rollback dữ liệu; queue/retry bền vững được deferred.
- UI quản lý địa chỉ có thể hoàn thiện ở tuần 4, nhưng toàn bộ API và test ownership cho địa chỉ phải xong trong Slice 02.
- Không sửa `docs/decisions`; decision log của slice được lưu ngay trong tài liệu thiết kế này.

### 2.2 Non-functional requirements

- **Security:** Argon2id; opaque token ngẫu nhiên tối thiểu 256-bit; chỉ lưu SHA-256 digest; generic credential/reset responses; exact Origin và CSRF header cho cookie mutation; không log secret.
- **Concurrency:** các thao tác rotate/consume/default-transition phải atomic; không cho phép hai successor hợp lệ hoặc hai địa chỉ mặc định.
- **Reliability:** lỗi SMTP không làm mất dữ liệu đã commit; logout idempotent; password change, user disable và reuse detection phải làm session mất hiệu lực ngay.
- **Performance:** guard thực hiện một lần đọc session/user cho mỗi protected request; index hiện hữu phải phục vụ email, digest, session family và address ownership lookup.
- **Maintenance:** controller chỉ xử lý transport; application service giữ use case/transaction; repository cô lập Prisma; provider được thay qua dependency injection.

## 3. Decision log

| ID | Quyết định | Phương án đã cân nhắc | Lý do chọn |
|---|---|---|---|
| D-01 | Modular Auth + custom guards | Passport strategies; một `AuthService` truy cập Prisma trực tiếp | Boundary rõ, ít abstraction framework không cần thiết và thuận lợi kiểm thử transaction/policy. |
| D-02 | Dùng JWT service nhưng guard tự xác minh JWT rồi kiểm tra session/user trong DB | Chỉ kiểm JWT stateless; Passport JWT guard | Đáp ứng yêu cầu revoke/disable/password-change có hiệu lực tức thời. |
| D-03 | Repository mỏng quanh Prisma, transaction orchestration ở application service | Đưa transaction vào controller hoặc repository tổng hợp | Use case sở hữu atomic boundary và dễ kiểm thử failure path. |
| D-04 | Rate limiter interface + in-memory adapter cho P0 | Nest Throttler; Redis-backed limiter | Giữ P0 không phụ thuộc Redis và cho phép thay adapter về sau. |
| D-05 | Refresh rotation dùng row lock trong transaction; reuse thu hồi cả family | Grace window; nhiều refresh token đồng thời | Khớp contract strict rotation/reuse và ngăn hai successor hợp lệ. |
| D-06 | Invitation employee ở Slice 02 là application service + public accept endpoint | Mở toàn bộ backoffice employee HTTP API ngay | Endpoint quản trị employee thuộc Slice 12 theo roadmap/inventory. |
| D-07 | Auth email gửi sau commit qua provider | Gửi trong transaction; queue/outbox | Không kéo dài/rollback transaction do SMTP và không đưa queue vào P0. |
| D-08 | Web giữ access token trong memory, refresh cookie `HttpOnly`, single-flight refresh | Local/Session Storage; mỗi request tự refresh | Giảm rủi ro XSS đánh cắp token và tránh refresh race phía client. |

## 4. Final design

### 4.1 Module boundary

- `AuthModule`: register, login, refresh, logout, forgot/reset password, invitation issue/accept và session revocation.
- `AccountsModule`: đọc/cập nhật hồ sơ, đổi mật khẩu và CRUD địa chỉ theo ownership.
- `UsersRepository`, `AuthSessionsRepository`, `AuthTokensRepository`, `AddressesRepository`: query/command Prisma có kiểu rõ ràng, không chứa transport logic.
- `PasswordService`: validate chính sách 8–128 ký tự có chữ và số; không trim mật khẩu trước hash; hash/verify bằng Argon2id.
- `TokenService`: access JWT và opaque refresh/reset/invitation token; chỉ trả raw opaque token tại boundary cần gửi cho client/email.
- `SessionGuard`: verify signature/issuer/audience/expiry rồi kiểm tra session active, chưa hết hạn và user `ACTIVE`.
- `AuthRateLimiter`: áp quota theo IP + normalized email hoặc session tùy endpoint.
- `MailProvider`: gửi reset/invitation sau commit; implementation local dùng SMTP/Mailpit và có fake cho test.

Controller chỉ validate DTO/header/cookie và ánh xạ HTTP. Application service sở hữu authorization, transaction, state transition và error mapping. Repository không được trả password hash/token digest ra response model.

### 4.2 Data flow và transaction

#### Register và login

Register chuẩn hóa email lowercase để kiểm tra unique, hash nguyên văn mật khẩu và tạo `CUSTOMER/ACTIVE`; không tạo session, access token hoặc refresh cookie. Login áp rate limit, dùng cùng generic invalid-credentials response cho email không tồn tại, sai mật khẩu, user không active hoặc employee chưa accept invitation. Khi hợp lệ, login tạo session, cập nhật `lastLoginAt`, phát access JWT và refresh cookie.

#### Refresh và logout

Refresh yêu cầu JSON content type, exact allowed Origin, `X-Rephone-CSRF: 1` và cookie `rephone_refresh`. Service tìm session bằng digest, khóa bản ghi trong PostgreSQL transaction, kiểm tra user/session/absolute expiry, revoke generation cũ và tạo đúng một successor cùng family/absolute expiry. Token cũ được dùng lại sẽ revoke toàn bộ family. Logout áp cùng kiểm tra Origin/CSRF, revoke session nếu nhận diện được, xóa cookie và luôn trả `204` khi token thiếu/hỏng/hết hạn.

#### Reset, invitation và password change

Forgot password luôn trả `202` với nội dung chung. Reset/invitation token là opaque one-time token, có TTL, chỉ lưu digest và được consume dưới row lock. Reset/change password cập nhật hash và revoke mọi session của user trong cùng transaction. Invitation acceptance chỉ kích hoạt đúng pending employee; việc tạo/resend invitation là application service nội bộ để Slice 12 tái sử dụng.

#### Account và address

Protected request đi qua `SessionGuard`. Mọi query account/address scope theo authenticated user; resource của user khác được coi như không tồn tại và trả `404`. Chuyển default address diễn ra atomically: bỏ default hiện tại và đặt bản ghi đích. Archive default không tự chọn địa chỉ thay thế.

### 4.3 HTTP và web client

Triển khai contract P0 cho:

- `/api/v1/auth/register`, `/login`, `/refresh`, `/logout`
- `/api/v1/auth/forgot-password`, `/reset-password`, `/accept-employee-invitation`
- `/api/v1/account`, `/account/change-password`
- `/api/v1/account/addresses` và `/account/addresses/{id}`

DTO dùng validation/decorator thống nhất; response giữ envelope chung và error registry dùng mã trong error catalog. Refresh cookie tên `rephone_refresh`, path `/api/v1/auth`, `HttpOnly`, `SameSite=Lax`, không có `Domain`, `Secure` ở production.

Web cung cấp register/login/logout tối thiểu. Auth provider giữ access token trong memory. Khi protected request nhận `401`, mọi request đồng thời dùng chung một refresh promise; sau thành công chỉ replay một lần. Auth endpoint và request đã replay không được kích hoạt refresh vòng lặp.

### 4.4 Testing và delivery

- **Unit:** password policy/hash, token digest/JWT claims, rate-limit keys, authorization/ownership và state transitions.
- **Integration/PostgreSQL:** normalized unique email, row lock rotation, concurrent refresh, reuse family revocation, one-time token consume, revoke-all và one-active-default-address.
- **E2E:** register không auto-login; login generic error; refresh/logout cookie + Origin/CSRF; reset/invitation TTL và one-time; disable/change-password tức thời; customer A không đọc/ghi dữ liệu customer B.
- **Contract:** sinh OpenAPI, kiểm tra response/error schema và regenerate typed client.
- **Web:** test single-flight refresh, replay tối đa một lần, token không vào Web Storage; chạy production build.
- **Delivery:** typecheck → lint → unit → integration → e2e → OpenAPI/client freshness → web build → `pnpm verify` → local migration/seed → Supabase deployment verification.

Seed/demo bổ sung một `ADMIN`, một `EMPLOYEE`, một `CUSTOMER` và một default address. Password seed phải được hash bằng cùng chính sách Argon2id; secret thật và hash cố định không được commit.

## 5. Failure handling và security checklist

- Unique-email race được ánh xạ sang conflict contract, không trả lỗi Prisma thô.
- Invalid/reused/expired token không tiết lộ token từng tồn tại hay thuộc user nào.
- Access JWT hợp lệ nhưng session revoked/expired hoặc user disabled vẫn bị từ chối.
- Refresh failure phải xóa cookie khi phù hợp và không replay vô hạn.
- SMTP failure chỉ ghi metadata an toàn; không log raw token, password, cookie, JWT hoặc digest.
- Database transaction retry chỉ áp dụng cho lỗi retryable với số lần hữu hạn; không retry side effect email.
- Error response không tiết lộ stack trace, Prisma constraint name hay security-state chi tiết.

## 6. Key risks

- **Refresh concurrency:** lỗi row-lock/transaction có thể tạo session successor sai. Giảm thiểu bằng integration test thực sự chạy hai request đồng thời trên PostgreSQL.
- **Client refresh loop:** middleware sai có thể lặp request hoặc refresh storm. Giảm thiểu bằng single-flight state machine và replay marker.
- **Timing/user enumeration:** nhánh login/forgot-password khác nhau có thể lộ account. Giảm thiểu bằng generic response, dummy password verification khi cần và test contract.
- **In-memory rate limit:** không có quota toàn cụm khi scale ngang. Chấp nhận cho P0 single-instance và giữ adapter boundary để nâng cấp.
- **Post-commit email:** không có durable retry khi SMTP lỗi. Chấp nhận ở P0; log có correlation ID để vận hành resend thủ công.

## 7. Nguồn contract

- [`auth-and-account-endpoints.md`](../api/auth-and-account-endpoints.md)
- [`auth-token-transport.md`](../api/auth-token-transport.md)
- [`endpoint-inventory.md`](../api/endpoint-inventory.md)
- [`error-catalog.md`](../api/error-catalog.md)
- [`authentication-and-security.md`](../architecture/authentication-and-security.md)
- [`security-threat-model.md`](../architecture/security-threat-model.md)
- [`notifications.md`](../architecture/notifications.md)
- [`identity-auth.md`](../data-model/identity-auth.md)
- [`roles-and-permissions.md`](../requirements/roles-and-permissions.md)
- [`implementation-roadmap.md`](implementation-roadmap.md)
- [`seed-and-demo-scenarios.md`](seed-and-demo-scenarios.md)
- [`requirements-traceability.md`](../quality/requirements-traceability.md)

