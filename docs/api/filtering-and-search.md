# Filtering và search

Mỗi collection endpoint của `/api/v1` định nghĩa query DTO và allowlist filter/search riêng. MVP dùng PostgreSQL trực tiếp; không có generic filter language hoặc external search engine.

## 1. Query shape

Ví dụ định hướng cho catalog:

```text
GET /api/v1/products?q=iphone%2013&productType=IPHONE&minPrice=5000000&maxPrice=15000000&sortBy=fromPrice&sortOrder=asc
```

- Filter name dùng `camelCase` và có type/enum/range rõ trong OpenAPI.
- Filter khác nhau kết hợp bằng `AND` trừ khi endpoint ghi rõ.
- `q` tìm bằng `OR` trên danh sách text field đã công bố của endpoint.
- Client không được truyền database column, relation path, SQL operator hoặc JSON expression tùy ý.
- Multi-value filter chỉ được thêm khi endpoint contract định nghĩa syntax cụ thể; không tự parse input mơ hồ.

## 2. Text search `q`

- Trim/normalize whitespace; chuỗi rỗng được xem như không có `q`.
- Giới hạn độ dài tối đa 100 ký tự; endpoint có thể đặt minimum hợp lý.
- PostgreSQL dùng case-insensitive contains matching (`ILIKE`) trên field allowlist.
- `%` và `_` từ input được escape, không cho client tự chèn wildcard semantics.
- Mỗi endpoint phải document search fields, ví dụ public catalog chỉ name/display name/SKU public-safe.
- Không đưa raw/encrypted IMEI, serial, EID, internal note, customer PII hoặc evidence metadata vào generic `q`.
- Staff tra cứu IMEI/serial dùng exact normalized HMAC lookup endpoint/policy riêng và phải audit khi reveal dữ liệu đầy đủ.

## 3. Typed filter

- Enum filter phải là enum hợp lệ; unknown value trả validation error.
- Money range nhận chuỗi số nguyên VND, parse bằng Decimal/integer-safe logic; `minPrice <= maxPrice`.
- Number/date range kiểm tra min/max và timezone theo data convention.
- Public availability filter phải tuân theo single-location allocation, không cộng tồn gây hiểu nhầm giữa STORE/WAREHOUSE.
- Admin endpoint có thể filter status/actor/date nhưng vẫn dùng DTO riêng và ownership/role predicate.

## 4. Sorting và pagination

- Filter/search áp dụng trước count, sort và offset.
- Count và data dùng cùng predicate.
- `sortBy/sortOrder` tuân theo [Pagination và sorting](pagination.md); không suy ra sort field từ filter.
- Search relevance ranking/full-text score chưa thuộc MVP; khi có `q`, endpoint vẫn dùng sort allowlist/default được document.

## 5. Database và performance

- MVP dùng Prisma query/PostgreSQL `ILIKE`; dataset nhỏ nên chấp nhận contains search cơ bản.
- B-tree index chỉ thêm cho filter/sort query thực tế.
- Không bật `pg_trgm` mặc định. Chỉ thêm sau khi đo query plan/latency và ghi migration/decision phù hợp.
- Không triển khai Elasticsearch, Meilisearch hoặc đồng bộ search index.
- Query parameter count/length chịu giới hạn request chung để tránh abuse.

## 6. Acceptance test tối thiểu

- Filter enum/range đúng cho kết quả và total cùng predicate.
- Unknown filter (khi global whitelist áp dụng), enum sai và range ngược trả validation error.
- `q` không phân biệt hoa/thường, escape `%/_` và không rò field nội bộ.
- Role/ownership scope không bị filter/search bypass.
- Money string lớn không bị chuyển qua JavaScript floating point.
- Search kết hợp pagination/sort có thứ tự ổn định.

## 7. P0 decisions

- Filter cụ thể nằm trong từng endpoint contract và phải xuất hiện trong OpenAPI query DTO.
- P0 không có multi-value/repeated/comma-separated filter; gửi lặp parameter bị validation từ chối trừ khi endpoint sau này định nghĩa rõ.
- Search chỉ case-insensitive theo PostgreSQL collation/`ILIKE`; accent-insensitive Vietnamese search thuộc P1 nếu dữ liệu thật chứng minh cần.

## Liên kết

- [Pagination và sorting](pagination.md)
- [Xác thực và bảo mật](../architecture/authentication-and-security.md)
- [ADR-0046](../decisions/0046-explicit-query-filters-and-postgresql-search.md)
- [Public catalog endpoints](public-catalog-endpoints.md)
