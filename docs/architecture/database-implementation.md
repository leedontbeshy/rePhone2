# Database implementation với PostgreSQL và Prisma

Tài liệu này chuyển data dictionary 28 bảng thành quy tắc triển khai vật lý. `schema.prisma` biểu diễn model/enum/relation/index thông thường; SQL migration bổ sung check, partial unique, trigger/default mà Prisma không biểu đạt đầy đủ.

## 1. Baseline

- PostgreSQL 18.4, schema `public`, encoding UTF-8, server timezone UTC.
- Prisma ORM 7 ESM với provider `postgresql`, generator `prisma-client`, output `apps/api/src/generated/prisma`.
- Runtime `PrismaPg` nhận `DATABASE_URL`; Prisma CLI trong `prisma.config.ts` dùng `DIRECT_URL`.
- ID là PostgreSQL `uuid`; Prisma field dùng `String @id @default(uuid(7)) @db.Uuid`. Prisma sinh UUIDv7 ở ORM layer, nên không phụ thuộc database có hàm `uuidv7()`; test có thể truyền ID có chủ đích.
- Timestamp là `timestamptz(3)`; money là `numeric(15,0)` và đi qua API dưới dạng chuỗi.
- Tên Prisma camelCase, bảng/cột SQL snake_case qua `@@map`/`@map` để migration và query dễ đọc.

## 2. Migration workflow

1. Sửa data dictionary nếu thay đổi business field/invariant.
2. Sửa `schema.prisma`.
3. Local chạy `prisma migrate dev --name <verb_noun>` để sinh migration.
4. Chỉnh file SQL vừa sinh để thêm constraint/index không diễn tả được.
5. Chạy migration từ database rỗng, seed, integration/concurrency tests.
6. Commit schema, toàn bộ migration và generated client liên quan.
7. Demo/production chỉ chạy `prisma migrate deploy`; không chạy `db push`.

Không sửa migration đã được chia sẻ. Nếu sai, tạo migration tiến. Mỗi migration ưu tiên nhỏ, forward-only; destructive change cần backup và bước chuyển dữ liệu rõ.

## 3. Constraint vật lý bắt buộc

### Identity và ownership

- `users.normalized_email` unique; role/status/password rules được kiểm tra ở application và test.
- CUSTOMER SUSPENDED cần `suspended_at`; EMPLOYEE DISABLED cần `disabled_at`; ACTIVE/PENDING clear timestamp tương ứng theo lifecycle command.
- Tối đa một địa chỉ default đang active/customer bằng partial unique `(customer_id) WHERE is_default AND archived_at IS NULL`.
- Token/session chỉ lưu digest; unique token digest. Mỗi refresh generation là một AuthSession row; rotation revoke row cũ và tạo successor cùng family/absolute expiry để giữ bằng chứng reuse. Expiry và revoke timestamp phải phù hợp lifecycle.
- Cart owner XOR: đúng một trong `customer_id`, `guest_token_hash`; guest có `expires_at`, customer không có.
- Tối đa một cart `ACTIVE` cho mỗi customer và mỗi guest hash bằng hai partial unique index.

### Catalog và inventory

- `products.slug`, `product_variants.sku`, `inventory_locations.code`, `inventory_units.inventory_code` unique.
- Product IPHONE mới dùng các field iPhone; variant IPHONE là `SERIALIZED`, phụ kiện P0 là `QUANTITY`. Cross-table rule được enforce trong transaction/service vì CHECK không join bảng.
- `compare_at_price IS NULL OR compare_at_price >= sale_price`; amount/counter không âm.
- Các HMAC IMEI/serial/EID unique trong từng cột khi khác null. Khi intake/sửa identifier, service lấy transaction advisory lock theo HMAC (sort lock order), rồi kiểm tra IMEI HMAC trên cả `imei1_hmac OR imei2_hmac` trước write; việc này ngăn cùng IMEI bị đặt ở hai slot khác nhau dưới concurrency. Ciphertext không unique và không index.
- `stock_levels` unique `(variant_id, location_id)`; `0 <= quantity_reserved <= quantity_on_hand`.
- Tối đa một inspection current/unit: partial unique `(inventory_unit_id) WHERE is_current`.
- Tối đa một inspection draft/unit: partial unique `(inventory_unit_id) WHERE status = 'DRAFT'`.
- Reservation target XOR unit/stock level; unit target có quantity 1.
- Tối đa một reservation `ACTIVE` cho mỗi inventory unit bằng partial unique `(inventory_unit_id) WHERE status = 'ACTIVE'`.
- ProductMedia có đúng một owner trong `product_id`, `variant_id`, `inventory_unit_id`; unique `(bucket, object_path)`.

### Cart, wishlist và voucher

- CartItem serialized unique theo `(cart_id, inventory_unit_id)` khi unit có giá trị; accessory unique `(cart_id, variant_id)` khi unit null.
- CartItem serialized quantity = 1. Type/mode target được xác minh bằng service.
- Wishlist dùng hai partial unique tương tự theo customer; chỉ CUSTOMER sở hữu.
- Voucher `ends_at > starts_at`; fixed amount > 0 hoặc percent là integer 1..100; quota nullable hoặc > 0.
- `voucher_usages.order_id` unique; trạng thái timestamp phù hợp state machine.
- `scope_config` validate bằng Zod ở write boundary và test database fixture; PostgreSQL chỉ kiểm tra object/null shape cơ bản nếu cần.

### Order, money và fulfillment

- `orders.order_number` và `orders.source_cart_id` unique; đúng một identity path customer hoặc guest access hash.
- PICKUP cần pickup location/hold fields và không có shipping address/deposit; SHIPPING cần shipping address và không có pickup fields.
- Các amount không âm; discount không vượt subtotal; `grand_total = subtotal - item_discount_amount - voucher_discount_amount + shipping_fee`. P0 item discount = 0, tổng OrderItem discount bằng voucher discount; mỗi line có `line_subtotal = unit_price * quantity`, `line_total = line_subtotal - discount_amount`.
- `deposit_required <= grand_total`; `balance_due = greatest(grand_total - paid_amount, 0)`; grand total bằng 0 có payment status PAID dù không có Payment row. Projection được application transaction cập nhật và integration test đối chiếu lại từ Payment/Refund.
- OrderItem quantity > 0, line total đúng; serialized item có quantity 1. Một inventory unit không xuất hiện ở hai OrderItem chưa cancel được bảo vệ chủ yếu bởi active reservation/transaction.
- Bank-transfer deposit cần bank snapshot, transfer content, review window và expiry; cash/COD tạo ở terminal fulfillment command.
- Payment/Refund amount rules và state-dependent timestamps được service guard; Refund REJECTED/CANCELLED cần terminal reason/actor/time, COMPLETED cần processor/completedAt. Thêm CHECK cho amount/timestamp có thể diễn tả mà không làm migration khó bảo trì.
- P0 tối đa một Shipment/order: unique `order_id`; đồng thời unique `(order_id, attempt_number)` và CHECK `attempt_number = 1`. FAILED cần reason/time; RETURNED cần returned location/note/time.

### Warranty, after-sales và system

- Một Warranty/OrderItem bằng unique `order_item_id`; `end_at >= start_at`.
- Tối đa một AfterSalesRequest chưa terminal/OrderItem bằng partial unique trên status `REQUESTED`, `RECEIVED`, `INSPECTING`, `APPROVED`.
- Warranty VOIDED cần reason/actor/time. After-sales receive/decision/resolution/cancel timestamp, actor, note và received location phải phù hợp status; REJECTED iPhone đã nhận có return note/time và application atomically trả unit về SOLD.
- Replacement unit khác original unit; chỉ iPhone được service cho phép replacement trực tiếp.
- `store_settings.key` unique và CHECK `key = 'STORE'`, nhờ đó chỉ có một singleton row; `version > 0`.
- `store_settings.shipping_deposit_amount > 0`; bank name/account/holder nonblank. Shipping `deposit_required` chỉ bằng 0 khi `grand_total = 0`.
- AuditLog append-only qua repository không export update/delete. Database role runtime không có quyền bypass ngoài migration; P0 không cần trigger chống update để seed/test vẫn đơn giản.

## 4. Index phục vụ endpoint P0

Ngoài unique/FK index, baseline gồm:

- Product `(status, type, created_at)`; P0 chưa bật `pg_trgm`, contains search dựa dataset nhỏ và chỉ thêm trigram sau query-plan benchmark.
- User `(role, status, created_at)` phục vụ employee/customer backoffice list; normalized email unique và phone/name search ở dataset demo nhỏ.
- Variant `(product_id, status)`, InventoryUnit `(variant_id, lifecycle_status, location_id)`.
- Order `(customer_id, created_at DESC)`, `(status, fulfillment_status, created_at DESC)`, `order_number` unique.
- Payment `(order_id, status)`, `(status, submitted_at)`; Refund `(order_id, status)`.
- Reservation `(status, expires_at)` phục vụ expiry job.
- Shipment `(tracking_code)`, Warranty `(warranty_code)`, AfterSales `(request_number)` unique/search.
- Audit `(resource_type, resource_id, created_at DESC)`, `(actor_user_id, created_at DESC)`, `(created_at DESC)`.

Chỉ thêm index mới khi endpoint/query plan cho thấy cần; kiểm tra bằng `EXPLAIN (ANALYZE, BUFFERS)` trên seed scale, tránh index mọi cột status.

## 5. Transaction và Prisma

- Use case cần isolation dùng interactive `$transaction` với `Serializable` và bounded retry theo [transaction strategy](transaction-and-concurrency.md).
- Raw SQL chỉ được gói trong repository/transaction helper, parameterized và có integration test.
- Job batch dùng câu lệnh claim/update có khóa hàng; không load rồi update ngoài transaction.
- External storage/email không gọi trong transaction. Upload trước rồi commit metadata; email sau commit.
- Prisma Decimal không đi thẳng ra JSON. Serializer chuyển Money thành digit string; tính tiền dùng `Prisma.Decimal` hoặc SQL numeric, không ép `number`.

## 6. Seed và reset

- Seed là idempotent bằng stable business key (`normalizedEmail`, `sku`, `inventoryCode`, `code`, settings key), không dựa ID cố định trừ fixture test có chủ đích.
- Local reset được phép bằng `prisma migrate reset` chỉ trên database tên `rephone_dev`/`rephone_test`; script phải từ chối URL khác.
- Seed không upload file thật; dùng object path demo hợp lệ hoặc adapter fake/local fixture theo [seed scenarios](../planning/seed-and-demo-scenarios.md).

## 7. Backup và portability

- Backup logical bằng `pg_dump --format=custom`; restore vào database mới rồi chạy smoke test.
- Supabase Storage object không nằm trong database backup; demo cần manifest/object fixture riêng.
- Không phụ thuộc Supabase-specific SQL extension hoặc native `uuidv7()` trong P0, nên có thể chuyển `DATABASE_URL` từ local Docker sang Supabase PostgreSQL mà không đổi ID strategy.

## 8. Definition of done schema

- 28 model đúng data dictionary, relations/FK/delete behavior explicit.
- Migration từ database rỗng chạy thành công trên PostgreSQL 18.4.
- Constraint tests chứng minh case sai bị từ chối.
- Concurrency tests chứng minh không double-sell/oversell/quota overflow.
- Seed chạy hai lần không nhân đôi dữ liệu.
- `prisma validate`, `prisma generate`, lint/typecheck/test qua.

## Liên kết

- [Data model index](../data-model/readme.md)
- [Data conventions](../data-model/conventions.md)
- [Transaction và concurrency](transaction-and-concurrency.md)
- [Toolchain](../development/toolchain-and-monorepo.md)
