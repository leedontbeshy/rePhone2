# Testing strategy và acceptance matrix

Mục tiêu kiểm thử P0 là chứng minh các invariant quan trọng của đồ án: đúng quyền, không bán trùng/oversell, tiền và trạng thái nhất quán, upload/identifier không lộ. Không chạy mọi test qua mock hoặc theo đuổi coverage hình thức.

## 1. Test layers

| Layer | Tool | Dependency | Phạm vi |
|---|---|---|---|
| Unit | Vitest | Không network/DB | Policy, pricing, voucher, state transition, serializer, config schema |
| Integration | Vitest + PostgreSQL 18 | DB test thật | Prisma repository, SQL constraint/index, transaction, migration |
| API e2e | Vitest + Supertest | Nest app + DB test; fake Storage/Mail mặc định | Auth/authorization/validation/envelope và vertical flows |
| Contract | OpenAPI generation/validation | Nest metadata | Route coverage, operationId, generated client drift |
| Browser smoke | Playwright, thêm khi UI có | Full stack local | Critical happy paths; không thay API e2e |

Test file đặt gần source cho unit (`*.spec.ts`), integration/e2e trong `apps/api/test`. Không mock Prisma trong test transaction: dùng database thật.

## 2. Test environment

- Compose profile `test` chạy PostgreSQL 18.4 riêng tại host port 5433/database `rephone_test`; không dùng database dev.
- Script test từ chối chạy nếu database name không kết thúc `_test`.
- Trước suite: deploy migration từ đầu. Giữa test: truncate 28 bảng theo dependency với identity reset không cần thiết vì UUID.
- Database integration/e2e chạy tuần tự ở P0 để fixture đơn giản; unit test được chạy song song.
- `SCHEDULER_ENABLED=false`; test job gọi handler/application command trực tiếp.
- Clock, random token/UUID và provider được inject. Test dùng UTC instant cố định, assert business display riêng.
- Storage/Mail fake là default; có một optional smoke suite với Supabase test bucket/Mailpit, không chạy trên mọi unit CI.

## 3. Fixture/factory rules

- Factory tạo trạng thái hợp lệ tối thiểu; override rõ field liên quan test.
- Không có một global fixture khổng lồ mà test ngầm phụ thuộc.
- Setup business state phức tạp qua application use case (checkout/verify/handover), không INSERT thẳng; direct INSERT chỉ dành constraint test.
- Password/token/identifier fixture là dữ liệu giả, không tái dùng credential cá nhân.
- Mỗi test tự sở hữu dữ liệu; public code thêm suffix deterministic theo test.

## 4. Critical acceptance matrix

### Auth và permission

- Register tạo CUSTOMER ACTIVE nhưng không auto-login/verify email.
- Login sai trả generic error; employee DISABLED và customer SUSPENDED không login.
- Refresh rotation: một request thắng và tạo successor cùng family/absolute expiry; hash cũ được giữ trong row đã revoke, reuse làm revoke family.
- Access token của session vừa logout/disable/change-password bị từ chối ở request kế tiếp.
- Logout current session idempotent; change/reset password revoke toàn bộ session atomically.
- Reset/invite token one-time, đúng TTL, database chỉ lưu digest.
- CUSTOMER/GUEST không vào backoffice; EMPLOYEE không xem cost/settings/employee management.
- EMPLOYEE chỉ đọc customer safe projection; ADMIN suspend/activate customer revoke access nhưng không sửa Order history.
- Actor A không đọc/sửa address/cart/order/warranty/after-sales của actor B.

### Catalog, inventory và inspection

- Variant mode khớp product type; invalid combination bị từ chối.
- iPhone chỉ AVAILABLE khi identifier, price, active catalog/location, unit photo và current PASSED inspection đầy đủ.
- PARTIAL/FAILED không AVAILABLE; completed inspection immutable và chỉ một current.
- IMEI/serial duplicate HMAC bị DB từ chối; public DTO chỉ masked suffix, reveal được audit.
- Accessory receipt/transfer/adjust/return tạo đúng StockMovement và counter; onHand/reserved không âm.

### Cart, voucher và checkout

- Guest cart cookie/merge không nhân item; serialized quantity luôn 1.
- Item unavailable/price changed trả đúng conflict và preview mới.
- Hai checkout/replay cùng source Cart trả cùng Order; `Order.sourceCartId` unique nên không cần client `Idempotency-Key` trong P0.
- Server không tin forged price/discount/shipping/deposit; expected total lệch bị reject trước mọi write.
- Voucher date/scope/minimum/visibility/quota/per-customer rule đúng; reserve/release/consume đúng vòng đời.
- Một Order chỉ lấy hàng từ một location.

### Payment, fulfillment và refund

- Pickup deposit = 0; shipping deposit = `min(settings amount, grandTotal)`.
- Shipping proof trước deadline chuyển UNDER_REVIEW và reservation không còn expiry; SLA review không auto-cancel.
- Verify deposit atomically xác nhận payment/order/reservation; underpayment không verify.
- Reject/expire deposit cancel/release đúng và không lặp side effect.
- Shipping fee chỉ override trước proof; total/deposit/balance recompute đúng.
- Pickup complete tạo CASH khi balance > 0; delivered tạo COD khi balance > 0; balance/grand total bằng 0 không tạo Payment nhưng summary vẫn PAID. P0 không tạo bank-transfer balance.
- Handover consume inventory đúng một lần; failed→returned đưa iPhone về INSPECTING; không redelivery P0.
- Cancel có tiền đã verify tạo refund obligation đúng; completed refund không vượt verified payment và bank refund cần evidence.

### Warranty và after-sales

- Warranty chỉ phát hành khi Order COMPLETED, `[startAt,endAt)` đúng số ngày snapshot.
- Warranty request cần active warranty, không có override P0; tối đa một active case/order item.
- Receive iPhone SOLD→INSPECTING; reject/return unchanged/repaired trả unit về SOLD.
- Replace cần iPhone khác hợp lệ; accessory không direct replacement.
- Refund resolution chỉ RESOLVED khi Refund COMPLETED.

### Files, jobs và observability

- Reject file vượt size/count, MIME giả/magic byte sai, SVG/executable; PDF chỉ được phép ở các evidence endpoint đã công bố.
- Private signed URL cần ownership/role và TTL 5 phút; object path không lộ trong public DTO.
- Expiry job race với proof submit cho đúng một kết quả nhất quán.
- Error envelope/header/log cùng request ID; redaction không lộ token/password/raw identifier.
- Readiness 503 khi DB down.

## 5. Concurrency suite bắt buộc

Mỗi test dùng barrier để hai/nhiều transaction bắt đầu gần nhau, không dựa `sleep` may rủi:

1. Hai checkout cùng một InventoryUnit: đúng một thành công, một conflict.
2. N checkout phụ kiện cuối tồn: tổng reserved không vượt onHand.
3. N checkout voucher quota cuối: usage RESERVED/CONSUMED không vượt limit.
4. Hai review cùng Payment: chỉ một terminal transition/audit/projection effect.
5. Submit proof và expiry cùng lúc: hoặc UNDER_REVIEW giữ reservation, hoặc EXPIRED/CANCELLED; không trạng thái lai.
6. Complete fulfillment replay: một StockMovement/payment/warranty effect.
7. Hai refresh token đồng thời: rotation/reuse policy xác định và không tạo hai session chain hợp lệ.

Nếu SERIALIZABLE trả `40001`/deadlock, test chấp nhận bounded retry nhưng cuối cùng phải assert invariant từ database, không chỉ HTTP status.

## 6. Coverage và CI gates

- Global API: tối thiểu 75% statements/branches cho code tự viết; generated/bootstrap/config boilerplate có thể exclude rõ.
- Critical policy/pricing/state machine/transaction service: branch coverage tối thiểu 90% hoặc có acceptance case giải thích ngoại lệ.
- Coverage không thay test concurrency/DB constraint.
- CI gate: format, lint (0 warning), typecheck, unit, migration-from-zero, integration/e2e, OpenAPI drift, build.
- Provider smoke/browser smoke có thể manual/pre-demo nếu CI không có credential/browser budget.

## 7. Test naming và diagnosis

Tên test theo behavior: `rejects second checkout for the same inventory unit`, không theo method nội bộ. Khi fail, log request ID/fixture IDs nhưng vẫn redacted. Không retry test flaky tự động; sửa clock/barrier/isolation cho deterministic.

## 8. Definition of done cho use case

- Happy path + validation + permission + invalid transition.
- DB constraint/transaction test nếu state/money/inventory thay đổi.
- Idempotency/replay test nếu command có key hoặc terminal side effect.
- OpenAPI/error contract cập nhật.
- Audit/log/notification assertion nếu use case yêu cầu.

## Liên kết

- [Non-functional requirements](../requirements/non-functional-requirements.md)
- [Transaction và concurrency](../architecture/transaction-and-concurrency.md)
- [Seed/demo scenarios](../planning/seed-and-demo-scenarios.md)
- [OpenAPI contract](../api/openapi-and-client.md)
- [Requirements traceability](requirements-traceability.md)
