# API error catalog

Tài liệu này là nguồn duy nhất cho stable `error.code` và HTTP mapping của `/api/v1`. Frontend branch theo code; message chỉ dùng hiển thị/log an toàn.

## 1. Mapping theo nhóm

| HTTP | Khi sử dụng |
|---:|---|
| `400 Bad Request` | JSON/DTO/query/header sai kiểu, thiếu field hoặc cross-field input không hợp lệ ở request boundary |
| `401 Unauthorized` | Thiếu/sai/hết hạn authentication credential |
| `403 Forbidden` | Identity hợp lệ nhưng không có role/policy hoặc account chưa đủ điều kiện |
| `404 Not Found` | Resource không tồn tại; customer ownership được che như not found |
| `409 Conflict` | Current state/concurrency/idempotency/availability đã thay đổi và request xung đột với dữ liệu hiện hành |
| `422 Unprocessable Content` | Request đúng cú pháp nhưng giá trị vi phạm business rule không phải state race |
| `413 Payload Too Large` | Body/file vượt giới hạn |
| `415 Unsupported Media Type` | MIME/file type không được hỗ trợ |
| `429 Too Many Requests` | Rate limit |
| `500 Internal Server Error` | Lỗi không dự kiến; client không nhận chi tiết nội bộ |
| `503 Service Unavailable` | Dependency bắt buộc tạm thời không khả dụng trước khi transaction bắt đầu |

## 2. Validation/Auth/Access

| Code | HTTP | Ý nghĩa |
|---|---:|---|
| `VALIDATION_FAILED` | 400 | DTO/query/header có một hoặc nhiều lỗi; `details` chứa field errors |
| `MALFORMED_JSON` | 400 | Request body không phải JSON hợp lệ |
| `AUTH_REQUIRED` | 401 | Endpoint yêu cầu authentication |
| `ACCESS_TOKEN_INVALID` | 401 | Access token sai/hết hạn |
| `INVALID_CREDENTIALS` | 401 | Email hoặc mật khẩu đăng nhập không đúng; không phân biệt nguyên nhân |
| `SESSION_REVOKED` | 401 | Session/refresh family không còn hiệu lực |
| `ACCOUNT_UNAVAILABLE` | 403 | Credential đúng nhưng tài khoản bị suspend/disable và không thể đăng nhập |
| `FORBIDDEN` | 403 | Thiếu role/policy; không dùng khi cần che ownership |
| `CSRF_VALIDATION_FAILED` | 403 | Cookie-authenticated mutation thiếu/sai Origin hoặc `X-Rephone-CSRF` |
| `RESOURCE_NOT_FOUND` | 404 | Resource public/admin generic không tồn tại |
| `ORDER_NOT_FOUND` | 404 | Order không tồn tại hoặc customer/guest không sở hữu |
| `FILE_TOO_LARGE` | 413 | Upload vượt giới hạn |
| `UNSUPPORTED_FILE_TYPE` | 415 | MIME/extension không thuộc allowlist |
| `RATE_LIMITED` | 429 | Quá giới hạn request |

`PENDING_VERIFICATION` employee chưa có password luôn nhận `INVALID_CREDENTIALS` khi login; API không tiết lộ tài khoản đang chờ invitation.

## 3. State và concurrency

| Code | HTTP | Ý nghĩa |
|---|---:|---|
| `INVALID_STATE_TRANSITION` | 409 | Resource không còn ở source state yêu cầu |
| `CONCURRENT_MODIFICATION` | 409 | Serializable transaction vẫn conflict sau bounded retry |
| `CHECKOUT_REVIEW_REQUIRED` | 409 | Pricing/deposit hiện hành khác expected amount; response details có summary an toàn |
| `INVENTORY_NOT_AVAILABLE` | 409 | Unit đã bị giữ/bán hoặc quantity không đủ |
| `CART_NOT_FULFILLABLE` | 409 | Không location đơn nào cấp được toàn bộ cart |
| `CART_NOT_ACTIVE` | 409 | Cart đã converted/expired/abandoned và không có order replay hợp lệ |
| `RESERVATION_EXPIRED` | 409 | Action đến sau reservation deadline |
| `PAYMENT_PROOF_DEADLINE_PASSED` | 409 | Submit proof sau deadline |
| `PAYMENT_ALREADY_REVIEWED` | 409 | Payment attempt đã terminal bởi actor khác |
| `VOUCHER_USAGE_LIMIT_REACHED` | 409 | Quota đã hết do trạng thái hiện hành/concurrent usage |
| `DUPLICATE_RESOURCE` | 409 | Business key đã tồn tại và không phải idempotent replay |
| `SETTINGS_VERSION_CONFLICT` | 409 | StoreSettings đã được actor khác cập nhật; client phải reload version mới |

## 4. Business rule

| Code | HTTP | Ý nghĩa |
|---|---:|---|
| `VOUCHER_NOT_APPLICABLE` | 422 | Voucher không thỏa scope/minimum/account policy |
| `CART_EMPTY` | 422 | Không có active cart/item để preview hoặc checkout |
| `DEPOSIT_AMOUNT_INSUFFICIENT` | 422 | Số thực nhận nhỏ hơn deposit required |
| `REFUND_AMOUNT_EXCEEDS_PAID` | 422 | Refund obligation/completion vượt verified payment còn lại |
| `ORDER_NOT_FULLY_PAID` | 422 | Completion cần payment summary PAID |
| `EVIDENCE_REQUIRED` | 422 | Transition cần private evidence nhưng chưa có |
| `EVIDENCE_INVALID` | 422 | Object không thuộc scope/path/metadata được cấp |
| `INVENTORY_INSPECTION_REQUIRED` | 422 | Unit chưa đủ current inspection để chuyển AVAILABLE |
| `INVENTORY_AVAILABILITY_REQUIREMENTS_NOT_MET` | 422 | Unit thiếu price/identifier/unit media/catalog/location requirement để AVAILABLE |
| `CART_ITEM_QUANTITY_FIXED` | 422 | iPhone serialized luôn quantity 1 và không hỗ trợ PATCH quantity |
| `WARRANTY_NOT_ACTIVE` | 422 | Warranty chưa hiệu lực, đã hết hạn hoặc đã void |
| `AFTER_SALES_RESOLUTION_REQUIREMENTS_NOT_MET` | 422 | Thiếu inspection/refund/replacement/note cho resolution |
| `AFTER_SALES_REQUEST_ALREADY_OPEN` | 409 | OrderItem đã có after-sales request non-terminal |
| `ONE_TIME_TOKEN_INVALID` | 422 | Reset/invitation token sai, hết hạn, đã dùng hoặc không còn phù hợp; không phân biệt nguyên nhân |
| `CURRENT_PASSWORD_INCORRECT` | 422 | Current password trong authenticated change-password không đúng |

## 5. Server/dependency

| Code | HTTP | Ý nghĩa |
|---|---:|---|
| `STORAGE_UNAVAILABLE` | 503 | Supabase Storage bắt buộc cho request hiện không truy cập được |
| `SERVICE_UNAVAILABLE` | 503 | Dependency bắt buộc khác tạm unavailable |
| `INTERNAL_ERROR` | 500 | Lỗi không dự kiến; message chung, có requestId |

Email gửi sau commit thất bại không đổi business response đã thành công; lỗi được log/quan sát theo notification policy, không trả 503 sau commit.

## 6. Mapping implementation

- Domain/application error mang stable `code` và structured metadata an toàn, không mang HTTP response object.
- API exception filter dùng registry trung tâm để map code → status/default message.
- Validation pipe chuẩn hóa lỗi thành `VALIDATION_FAILED` và field details.
- Prisma unique/check/FK/serialization error chỉ map khi xác định được constraint/use case. Database error lạ thành `INTERNAL_ERROR`.
- Không map bằng cách parse raw database message phụ thuộc ngôn ngữ; dùng error code/constraint identity có kiểm soát.
- Log server có stack/internal context theo requestId nhưng phải redacted; client không nhận stack/SQL/Prisma code.

## 7. Ownership và chống enumeration

- Customer/guest truy cập private resource không thuộc mình nhận cùng 404/code như resource không tồn tại.
- Admin/staff đã xác thực nhưng thiếu một capability không cần che existence nhận 403.
- Public order number, inventory code hoặc UUID không tự cấp quyền truy cập.

## 8. Quy tắc quản trị catalog

- Mỗi code chỉ có một nghĩa chính và một HTTP mapping mặc định.
- Thêm/đổi/xóa code phải cập nhật file này, OpenAPI và contract test.
- Không tái sử dụng code cũ cho nghĩa khác.
- Endpoint docs liệt kê subset error quan trọng; không copy một danh sách chung không liên quan.
- `message` có thể được sửa câu chữ/localize mà không phải breaking change; `code` là contract.

## Liên kết

- [API response contract](response-contract.md)
- [REST API conventions](readme.md)
- [ADR-0047](../decisions/0047-centralized-domain-error-catalog.md)
