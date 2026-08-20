# Pagination và sorting

Các collection endpoint của `/api/v1` dùng offset pagination thống nhất bằng `page/pageSize`. Quy mô MVP nhỏ và UI admin cần biết tổng số trang, nên không dùng cursor pagination.

## 1. Query parameters

```text
GET /api/v1/products?page=1&pageSize=20&sortBy=createdAt&sortOrder=desc
```

| Parameter | Default | Quy tắc |
|---|---:|---|
| `page` | 1 | Integer >= 1 |
| `pageSize` | 20 | Integer 1..100 |
| `sortBy` | Theo endpoint | Chỉ nhận field trong allowlist endpoint |
| `sortOrder` | Theo endpoint | `asc` hoặc `desc` |

- Query DTO parse và validate kiểu rõ ràng; không âm thầm sửa input sai thành default.
- Field sort không nằm trong allowlist trả validation error.
- Client không được truyền raw SQL column/expression.
- Filter/search khác là query parameter explicit của từng endpoint, không có generic query DSL.

## 2. Response metadata

```json
{
  "data": [],
  "meta": {
    "pagination": {
      "page": 1,
      "pageSize": 20,
      "totalItems": 125,
      "totalPages": 7
    }
  }
}
```

- `totalItems` là tổng record sau khi áp dụng cùng filter/permission scope, trước limit/offset.
- `totalPages = ceil(totalItems / pageSize)`; bằng 0 khi `totalItems = 0`.
- `page` vượt `totalPages` trả `200 OK`, `data: []` và metadata thật; không trả 404.
- Tất cả số pagination là JSON number an toàn, không dùng Money convention.

## 3. Stable ordering

- Mỗi endpoint định nghĩa default sort phù hợp, ví dụ catalog `createdAt desc`, order `placedAt desc`.
- Query luôn thêm `id` làm tie-breaker theo cùng hướng nếu sort chính không unique.
- Sort field hiển thị cho client dùng tên API `camelCase`, được map sang query nội bộ bằng allowlist.
- Không hứa snapshot isolation giữa các lần đổi page; item có thể dịch chuyển khi dữ liệu đang được cập nhật.

## 4. Performance và giới hạn

- `skip = (page - 1) * pageSize`; DTO phải chặn integer overflow/giá trị vô lý.
- `pageSize` tối đa 100 cho cả public/admin trong MVP.
- Count và list dùng cùng filter/ownership predicate.
- Không dùng `Serializable` cho list query thông thường.
- Chỉ thêm index theo endpoint/filter/sort thực tế và query plan; không index mọi field.
- Nếu production data tăng tới mức offset trở thành bottleneck, tạo ADR mới để chuyển endpoint cụ thể sang cursor.

## 5. Acceptance test tối thiểu

- Default trả page 1, pageSize 20 và metadata đúng.
- pageSize 0/101, page 0 và sort field lạ trả validation error.
- Page cuối, page rỗng và dataset rỗng tính totalPages đúng.
- Hai record trùng sort value vẫn có thứ tự ổn định nhờ `id`.
- Permission/filter scope áp dụng giống nhau cho count và data.

## Liên kết

- [API response contract](response-contract.md)
- [REST API conventions](readme.md)
- [Filtering và search](filtering-and-search.md)
- [ADR-0045](../decisions/0045-offset-pagination.md)
