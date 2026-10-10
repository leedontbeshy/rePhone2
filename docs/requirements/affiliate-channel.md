# Affiliate một cấp

Triển khai trên `feat/affiliate-v1`. Chỉ sử dụng PostgreSQL local `rephone_test` cho migration, seed và kiểm thử; không thay đổi Supabase hoặc dealer sandbox.

## Quyết định

- Chỉ iPhone bán lẻ, không đơn DEALER hoặc hoa hồng tuyến dưới. CUSTOMER đăng ký và ADMIN duyệt.
- Link hợp lệ cuối trong 30 ngày, cùng trình duyệt, không hồi tố và không tự giới thiệu.
- Admin đặt tỷ lệ chung và override từng máy (0–5%). Chương trình mặc định đóng, tỷ lệ và sàn chưa cấu hình.
- Hoa hồng trên giá dòng máy sau voucher, làm tròn xuống, không vượt phần còn lại sau giá vốn + chi phí + dự phòng + lãi tối thiểu. Thiếu giá vốn không có hoa hồng, không chặn bán lẻ.
- Snapshot khi checkout. Chờ 14 ngày từ mốc muộn hơn hoàn tất/thu đủ, tạm giữ nếu có refund hoặc hậu mãi đang mở.
- Hoàn tiền phải phân bổ theo sản phẩm/phí giao/tiền thừa. Hoàn chưa chi làm giảm hoa hồng; phần đã chi do rePhone chịu, không truy thu hay trừ lần sau.
- Nhận toàn bộ số khả dụng khi đạt 200.000đ; mỗi người một yêu cầu chưa kết thúc. Admin chuyển khoản thủ công, xác nhận với chứng từ và mã giao dịch. Chưa rõ kết quả tiếp tục giữ tiền.
- Ngân hàng mã hóa, xác thực lại mật khẩu, xác nhận email và admin xác minh. Thay thế chờ 24 giờ; yêu cầu chi giữ snapshot.
- Portal không xuất dữ liệu người mua, giá vốn hoặc chứng từ của khách. Hạ tầng, số liệu và sổ tiền tách khỏi đại lý.

## Bất biến

Một attribution/đơn, một commission/dòng máy, một khoản chỉ được giữ/chi một lần. Retry không nhân đôi tiền. Chính sách mới không sửa snapshot cũ. Mọi thay đổi tài chính có audit; email không nằm trong transaction. Dữ liệu ngân hàng và chứng từ không xuất qua DTO thường. Payout luôn kiểm lại nguồn đơn, refund, hậu mãi dưới khóa, không chỉ tin scheduler.

## Kiểm chứng

Unit chính sách; PostgreSQL/HTTP với tranh chấp payout–refund, idempotency, phân quyền và ngân hàng; kiểm tra trình duyệt cho đăng ký, duyệt hồ sơ, tìm máy, link giới thiệu và xác nhận ngân hàng; hồi quy checkout/đại lý. Chương trình chỉ mở sau khi admin cấu hình đầy đủ. AI, ví, ngân hàng tự động và affiliate nhiều cấp nằm ngoài phạm vi.
