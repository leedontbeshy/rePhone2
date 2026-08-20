# Yêu cầu phi chức năng

## 1. Hiệu năng và quy mô

- Mục tiêu khoảng 20–50 người dùng đồng thời, phù hợp demo và cửa hàng nhỏ.
- Dữ liệu mục tiêu: vài chục nghìn sản phẩm, thiết bị, đơn và bản ghi liên quan.
- API nghiệp vụ thông thường hướng tới p95 dưới 500 ms trong điều kiện demo/local hợp lý, không tính upload media hoặc dịch vụ ngoài; đây là mục tiêu kỹ thuật, không phải SLA production.
- Danh sách lớn phải phân trang server-side và có index theo truy vấn thực tế.
- Ảnh được phục vụ qua Supabase Storage/CDN và không đi qua database.

## 2. Tính nhất quán và tin cậy

- Ưu tiên tính nhất quán tồn kho và tiền hơn availability tuyệt đối.
- Checkout, reserve, consume/release stock và voucher usage dùng transaction/atomic update.
- Scheduled job trong P0 chạy trên một API instance và phải idempotent/an toàn khi chạy lại.
- Docker service có health check; migration được quản lý và không dùng schema auto-sync trong production.
- Môi trường đồ án không có SLA, high availability hoặc distributed job coordination. Backup/restore và runbook demo được định nghĩa ở mức P0; production HA/DR đầy đủ thuộc giai đoạn sau.

## 3. Bảo mật và riêng tư

- Hash mật khẩu mạnh, token ngắn hạn, refresh-token rotation và revoke session.
- RBAC/ownership ở backend; validation và rate limiting cho endpoint nhạy cảm.
- IMEI/serial/EID được mã hóa; HMAC dùng cho lookup/chống trùng; không dùng hash trực tiếp dễ brute-force.
- Secret không commit vào repository; cung cấp `.env.example` không chứa giá trị thật.
- DTO public không chứa giá vốn, ciphertext, token hash hoặc định danh đầy đủ.
- Ghi security/audit event cho đăng nhập nhạy cảm, vòng đời tài khoản, xem định danh, xác nhận cọc và hoàn tiền.

## 4. Khả năng bảo trì

- Modular monolith với ownership dữ liệu rõ ràng.
- REST contract được tài liệu hóa bằng OpenAPI và sinh typed client cho frontend.
- Migration, seed data và test fixture có thể tái tạo môi trường local.
- Log có request ID và định dạng có cấu trúc.
- Quyết định kiến trúc được lưu bằng ADR; thay đổi code phải cập nhật docs liên quan.

## 5. Khả năng kiểm thử

- Unit test cho policy, state transition, pricing, voucher và permission.
- Integration test với PostgreSQL test database cho transaction và constraint.
- E2E test cho đăng ký, checkout, cọc, fulfillment, hủy/hết hạn và bảo hành.
- Tối thiểu phải có test cạnh tranh đồng thời để chứng minh không bán trùng iPhone hoặc oversell phụ kiện.

## 6. Khả năng triển khai

- Local chạy bằng Docker Compose.
- Web, API và PostgreSQL cấu hình qua environment variables.
- Supabase Storage và SMTP là provider ngoài có adapter.
- Thiết kế đủ để chuyển lên VPS sau này nhưng cloud deployment không phải tiêu chí bắt buộc của tháng đầu.

## 7. Tài liệu kiểm chứng

- [Testing strategy](../quality/testing-strategy.md)
- [Security threat model](../architecture/security-threat-model.md)
- [Observability và health](../architecture/observability.md)
- [Local/deployment runbook](../operations/local-development-and-deployment.md)
