# API response contract

Mọi JSON response của `/api/v1` dùng một trong hai top-level key: `data` khi thành công hoặc `error` khi thất bại. HTTP status vẫn mang đúng ý nghĩa; envelope không biến mọi response thành `200 OK`.

## 1. Single resource và command

Response `200 OK` hoặc `201 Created`:

```json
{
  "data": {
    "id": "0198...",
    "status": "CONFIRMED"
  }
}
```

- Create resource thường trả `201 Created` và có thể kèm `Location` header.
- Named command trả `200 OK` với resource/projection sau commit.
- Idempotent replay trả cùng logical resource; status code cụ thể được endpoint contract mô tả.
- `202 Accepted` dùng khi request được chấp nhận nhưng kết quả delivery không được tiết lộ/đảm bảo ngay. P0 dùng cho `forgot-password` để chống account enumeration; các business command còn lại không dùng 202 nếu đã commit và có projection trả về.

## 2. Collection

List response:

```json
{
  "data": [],
  "meta": {
    "pagination": {}
  }
}
```

- `data` luôn là array, kể cả không có kết quả.
- `meta.pagination` bắt buộc với endpoint phân trang và có `page`, `pageSize`, `totalItems`, `totalPages`.
- Metadata không được trộn vào từng item.

## 3. No content

- `204 No Content` không có response body và không được bọc thành `{ "data": null }`.
- Chỉ dùng 204 khi client không cần resource state sau command.
- Business transition quan trọng ưu tiên trả projection mới để frontend đồng bộ.

## 4. Error envelope

```json
{
  "error": {
    "code": "INVENTORY_NOT_AVAILABLE",
    "message": "Sản phẩm không còn khả dụng.",
    "details": [],
    "requestId": "0198e4f0-7d16-7c1a-a2bd-39bc2a0f67e1"
  }
}
```

| Field | Quy tắc |
|---|---|
| `code` | Stable `UPPER_SNAKE_CASE`; frontend dùng để branch |
| `message` | Mô tả an toàn cho người dùng/developer; không phải contract để branch |
| `details` | Array; rỗng khi không có chi tiết có cấu trúc |
| `requestId` | Correlation ID của request, luôn có |

Validation detail baseline:

```json
{
  "field": "customerEmail",
  "code": "INVALID_EMAIL",
  "message": "Email không hợp lệ."
}
```

Không trả stack trace, Prisma/PostgreSQL error, internal path, secret, private signed URL hoặc field bị redacted.

## 5. Serialization rules

- JSON property dùng `camelCase`.
- Enum value dùng `UPPER_SNAKE_CASE`.
- UUID trả string.
- Money trả chuỗi số nguyên VND, ví dụ `"15000000"`.
- Instant trả ISO 8601 UTC/offset, ví dụ `"2026-08-18T10:30:00.000Z"`.
- Field optional không tồn tại có thể được omit; field có ý nghĩa “chưa có” theo DTO có thể là `null`. Mỗi DTO phải nhất quán.
- DTO public không bao gồm password/token hash, raw device identifier, cost, private object path hoặc internal note trái permission.

## 6. NestJS/OpenAPI convention

- Success serialization interceptor wrap kết quả application thành `{ data, meta? }`; application service không tự xây HTTP envelope.
- Global exception filter map domain/application error thành `{ error }`.
- Tránh double-wrap bằng một response abstraction thống nhất.
- OpenAPI mô tả envelope schema cụ thể cho từng DTO, không dùng `object` chung khiến mất type.
- `requestId` được tạo/nhận ở request boundary và đi qua log/audit/error response.

## 7. Ngôn ngữ message

P0 dùng message tiếng Việt nhất quán. `error.code` mới là contract ổn định để client branch; i18n/multi-locale thuộc P1 và không làm thay đổi code/status/details hiện hành.

## Liên kết

- [REST API conventions](readme.md)
- [ADR-0044](../decisions/0044-consistent-api-response-envelope.md)
- [Pagination và sorting](pagination.md)
- [API error catalog](error-catalog.md)
