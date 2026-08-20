# OpenAPI và typed API client

OpenAPI là contract máy đọc được giữa `apps/api` và `apps/web`; các file Markdown trong `docs/api` giải thích business semantics, còn schema sinh từ code xác nhận DTO/path/status thực tế.

## 1. Nguồn sự thật và artifact

- Nest controller/DTO + Swagger decorators sinh `apps/api/openapi/openapi.json`.
- Artifact được generate bằng script không cần bind port và được commit để review diff.
- `packages/api-client/src/schema.d.ts` sinh từ artifact bằng `openapi-typescript`.
- `packages/api-client` export một `openapi-fetch` client factory và type; không chứa business state.
- Không chỉnh tay file generated. Thay controller/DTO rồi generate lại.

Markdown và OpenAPI phải cùng khớp. Nếu schema kỹ thuật khác business rule trong docs, implementation chưa hoàn tất; không coi generated schema tự động ghi đè quyết định nghiệp vụ.

## 2. Metadata chuẩn

- Title: `rePhone API`.
- API version: `1.0.0`; route prefix `/api/v1`.
- Server local: `http://localhost:4000`.
- Tags theo module: Auth, Accounts, Catalog, Inventory, Cart, Wishlist, Vouchers, Checkout, Orders, Payments, Fulfillment, Refunds, Warranty, AfterSales, Employees, Customers, Settings, Audit.
- Bearer security cho access token; refresh/guest cookie mô tả bằng cookie security scheme và endpoint note.
- Money là `string`, pattern `^[0-9]+$`, example `12500000`.
- Instant là `string` format `date-time`; ID là `string` format `uuid`.

## 3. Mô tả endpoint bắt buộc

Mỗi operation có:

1. `operationId` ổn định dạng camelCase use case, ví dụ `createCheckout`, `verifyPayment`.
2. Tag, summary, actor/permission ngắn gọn.
3. Path/query/header/cookie parameters và request DTO.
4. Success status + response envelope cụ thể.
5. Error envelope chung và các domain `error.code` chính.
6. `Idempotency-Key` ở command được tài liệu API yêu cầu.
7. Multipart schema cho upload, bao gồm size/type mô tả.

Không serialize Prisma model để “tự sinh schema”. Response DTO allow-list field public/backoffice rõ ràng và dùng serializer thống nhất.

## 4. Sinh client và kiểm tra drift

Pipeline local/CI:

```text
build API metadata
  → generate openapi.json
  → validate OpenAPI
  → generate packages/api-client
  → fail nếu git diff còn artifact chưa commit
  → typecheck web
```

CI dùng script generate deterministic: không ghi timestamp, machine path hay port ngẫu nhiên. Sort schema/route ổn định trước khi ghi. Test smoke kiểm tra mọi route `/api/v1` có trong OpenAPI và mọi `operationId` unique.

## 5. Client runtime

- Browser client dùng `NEXT_PUBLIC_API_BASE_URL`, gửi access token trong `Authorization` và cookie với `credentials: "include"`.
- Refresh chỉ được điều phối một lần khi nhiều request đồng thời gặp access token hết hạn; replay tối đa một lần.
- Không refresh cho 401 từ login/refresh/logout hoặc khi request đã replay.
- Error envelope được giữ nguyên `code`, `message`, `details`, `requestId`; UI không parse message để quyết định logic.
- Server-side Next request không forward toàn bộ browser headers/cookie một cách mù quáng.

## 6. Definition of done cho một endpoint

- Markdown contract đã tồn tại hoặc được cập nhật.
- DTO validation, authorization và response serializer đã triển khai.
- OpenAPI có success/error/security đúng.
- Unit/policy test và integration/e2e theo mức rủi ro đã qua.
- Generated artifact/client đã cập nhật, web typecheck không lỗi.
- Endpoint inventory không còn đánh dấu pending cho nhóm đó.

## Liên kết

- [REST conventions](readme.md)
- [Response contract](response-contract.md)
- [Error catalog](error-catalog.md)
- [Endpoint inventory](endpoint-inventory.md)
- [Toolchain và monorepo](../development/toolchain-and-monorepo.md)
