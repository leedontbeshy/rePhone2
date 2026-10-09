# Luồng nghiệp vụ cộng tác viên (Affiliate) một cấp của rePhone

Tài liệu phục vụ phân tích, thiết kế và mô tả hiện thực trong đồ án. Nội dung đối chiếu với mã nguồn trên nhánh `feat/affiliate-v1`, cập nhật ngày 10/10/2026. Các giá trị tiền trong ví dụ là minh họa, không phải cam kết thu nhập. Phiên bản đang được chạy thử trên database local `rephone_test`.

## 1. Mục tiêu và phạm vi

Chức năng cộng tác viên bổ sung một kênh giới thiệu khách hàng cho hệ thống bán iPhone cũ rePhone. Người tham gia chia sẻ đường dẫn sản phẩm; khi khách được giới thiệu phát sinh đơn hợp lệ, hệ thống ghi nhận hoa hồng. rePhone tiếp tục đảm nhiệm bán hàng, thu tiền, xử lý đơn, giao máy và bảo hành.

Đây là chương trình một cấp: cộng tác viên chỉ hưởng hoa hồng từ đơn hàng được ghi nhận cho chính mình. Không có tuyến dưới, thưởng tuyển người, chia hoa hồng nhiều tầng hoặc chuyển số dư giữa cộng tác viên.

Phạm vi hiện tại gồm đăng ký và duyệt hồ sơ; chính sách chung và tỷ lệ từng máy; link giới thiệu; ghi nhận nguồn đơn; tính hoa hồng; đối soát hậu mãi/hoàn tiền; xác minh ngân hàng; yêu cầu và xác nhận chi trả. Chỉ áp dụng cho iPhone trong đơn bán lẻ. Phụ kiện, đơn đại lý, AI, quảng cáo tự động và tự động chuyển tiền ngân hàng nằm ngoài phạm vi.

## 2. Phân biệt cộng tác viên, đại lý và khách mua

| Nội dung | Cộng tác viên | Đại lý | Khách mua tại rePhone |
| --- | --- | --- | --- |
| Vai trò | Giới thiệu khách mua | Mua lại máy để bán cho khách của mình | Mua và sử dụng sản phẩm |
| Quyết định giá bán cuối | rePhone | Đại lý | Không áp dụng |
| Thu tiền khách cuối | rePhone | Đại lý | Thanh toán cho bên bán |
| Thu nhập | Hoa hồng của đơn hợp lệ | Chênh lệch giữa giá bán và giá đại lý, trước chi phí | Không áp dụng |
| Có cần đặt máy/giữ kho để chia sẻ? | Không | Giữ máy khi tạo đơn thành công | Theo quy trình checkout |
| Nơi xử lý đơn | Luồng bán lẻ hiện có | Luồng đơn DEALER | Cửa hàng hoặc liên kết đơn khách |
| Nguồn chi trả | rePhone chi cho cộng tác viên | Không sử dụng sổ hoa hồng affiliate | Refund theo nghiệp vụ bán lẻ |

Một đơn đại lý không đồng thời được hưởng hoa hồng affiliate. Không cộng gộp chiết khấu đại lý và hoa hồng cộng tác viên thành một cơ chế.

## 3. Tác nhân và quyền hạn

| Tác nhân | Hoạt động |
| --- | --- |
| Người chưa đăng nhập | Xem trang giới thiệu `/affiliate`, điều khoản, mở link giới thiệu và xem sản phẩm |
| Khách hàng đã có tài khoản | Gửi hồ sơ cộng tác viên, theo dõi kết quả duyệt |
| Cộng tác viên đang hoạt động | Xem máy, sao chép link, xem hoa hồng của mình, gửi ngân hàng và yêu cầu rút |
| Quản trị viên (ADMIN) | Cấu hình chương trình, duyệt hồ sơ/ngân hàng, đối soát và ghi nhận chi trả |
| Nhân sự vận hành bán lẻ | Xử lý thanh toán, giao hàng, hậu mãi và hoàn tiền theo quyền sẵn có; không mặc nhiên được quản trị affiliate |
| Hệ thống | Ghi nhận nguồn giới thiệu, tính và chốt hoa hồng, chuyển trạng thái, kiểm tra trùng và phân quyền |

## 4. Luồng tổng thể

1. Quản trị viên cấu hình và mở chương trình.
2. Khách hàng gửi hồ sơ cộng tác viên, đồng ý phiên bản điều khoản hiện hành.
3. Quản trị viên duyệt hồ sơ; cộng tác viên nhận mã giới thiệu riêng.
4. Cộng tác viên chọn máy và chia sẻ link.
5. Người mua mở link; hệ thống ghi nhận lượt giới thiệu hợp lệ bằng cookie và tự chuyển đến đúng trang máy.
6. Người mua đặt hàng theo quy trình bán lẻ. Server kiểm tra lại điều kiện và chốt hoa hồng trong cùng giao dịch tạo đơn.
7. Đơn được xử lý, thanh toán đủ và hoàn tất. Hoa hồng chờ thêm 14 ngày tính từ mốc đủ cả hai điều kiện.
8. Nếu không có vấn đề hậu mãi/hoàn tiền, hoa hồng trở thành khả dụng.
9. Cộng tác viên có tài khoản ngân hàng đã xác minh gửi yêu cầu rút toàn bộ số khả dụng từ 200.000đ.
10. Quản trị viên đối soát, chuyển tiền ngoài hệ thống rồi lưu giao dịch và chứng từ. Hệ thống ghi nhận đã chi.

Đăng ký/xác minh ngân hàng có thể thực hiện trước khi có hoa hồng; không bắt buộc phải chờ đến bước rút tiền.

## 5. Luồng cấu hình chương trình

**Màn hình:** `/backoffice/affiliates` → Cấu hình.

Quản trị viên nhập tỷ lệ hoa hồng chung (0–5%), khoản dự phòng cho mỗi máy và lợi nhuận tối thiểu phải giữ lại. Hệ thống kiểm tra dữ liệu phía server, kiểm tra phiên bản cấu hình để tránh hai người ghi đè thay đổi của nhau, lưu chính sách và ghi audit.

Trong mục Hoa hồng từng máy, quản trị viên có thể tắt hoa hồng hoặc đặt tỷ lệ riêng. Để trống tỷ lệ riêng nghĩa là kế thừa tỷ lệ chung; nhập 0% nghĩa là không phát sinh hoa hồng cho máy đó. Giá vốn và chi phí bổ sung được lấy từ quản lý tồn kho, không cho cộng tác viên nhập hoặc xem.

Cần phân biệt hai lớp điều khiển:

- Cấu hình hạ tầng `AFFILIATE_ENABLED` và môi trường hợp lệ quyết định module có sẵn sàng phục vụ hay không.
- Nút bật/tắt chương trình lưu trong `AffiliatePolicy.enabled` quyết định nhận hồ sơ và ghi nhận giới thiệu/hoa hồng mới. Tắt nút này không tự xóa nghĩa vụ đã ghi nhận; ngân hàng và chi trả cũ vẫn được xử lý khi module còn hoạt động.

Không nên mô tả việc tắt biến hạ tầng là tương đương nút tạm đóng chương trình, vì nó có thể làm các chức năng của module không truy cập được.

## 6. Đăng ký và xét duyệt

**Tiền điều kiện:** người dùng có tài khoản CUSTOMER đang sử dụng được, chương trình sẵn sàng và đang mở.

1. Người dùng xem quyền lợi, cách tham gia, cách tính tiền và câu hỏi thường gặp tại `/affiliate`.
2. Nếu chưa đăng nhập, nút đăng ký mở trang đăng nhập và giữ địa chỉ quay lại `/affiliate`. Khi chuyển qua tạo tài khoản rồi quay lại đăng nhập, địa chỉ đích được giữ lại.
3. Người dùng điền tên hiển thị, số điện thoại, kênh dự kiến chia sẻ và đồng ý điều khoản.
4. Server xác định chủ hồ sơ từ phiên đăng nhập; kiểm tra dữ liệu và phiên bản điều khoản. Không nhận chủ hồ sơ tùy ý do trình duyệt chỉ định.
5. Hệ thống tạo hồ sơ `PENDING`, lưu thời điểm chấp thuận điều khoản, mã giới thiệu và audit. Mỗi tài khoản chỉ có một hồ sơ; gửi lặp không tạo thêm hồ sơ.
6. Admin duyệt thành `ACTIVE` hoặc từ chối thành `REJECTED`, kèm lý do. Hồ sơ bị từ chối có thể được gửi lại để xét duyệt.
7. Hồ sơ đã đăng ký xuất hiện qua nút Cộng tác viên trong `/account` và menu tài khoản. Nút này thể hiện đã có hồ sơ, không có nghĩa hồ sơ đã được duyệt.

| Trạng thái hồ sơ | Ý nghĩa |
| --- | --- |
| PENDING | Chờ duyệt, link chưa được ghi nhận hợp lệ |
| ACTIVE | Được giới thiệu nếu chương trình đang mở và tài khoản chủ còn hoạt động |
| REJECTED | Hồ sơ bị từ chối, xem lý do và có thể đăng ký lại |
| SUSPENDED | Dừng giới thiệu mới; khoản hợp lệ cũ vẫn có thể rút nếu không bị giữ chi trả |

`payoutHold` là cờ tạm giữ chi trả độc lập với trạng thái hồ sơ. Tạm ngừng giới thiệu không mặc nhiên tịch thu hoa hồng đã đủ điều kiện.

## 7. Chọn máy và tạo đường dẫn giới thiệu

**Màn hình:** Cộng tác viên → Link giới thiệu.

Hệ thống liệt kê iPhone đang bán, có giá, sản phẩm/biến thể hoạt động và chưa có reservation hiệu lực. Có tìm theo tên dòng máy và phân trang. Mỗi máy có mã tồn kho, tên dòng/biến thể, giá bán hiện tại và hoa hồng dự kiến. Máy có hoa hồng bằng 0 không được bật nút sao chép link riêng trên giao diện.

Dạng đường dẫn:

```text
/r/{maCongTacVien}?to=/products/{slug}/units/{maMay}
```

Tham số `to` được mã hóa khi tạo URL. Ví dụ: `/r/abc123?to=%2Fproducts%2Fiphone-13%2Funits%2FIP13-MID-001`.

Link chung `/r/{maCongTacVien}` mở danh sách sản phẩm. Link riêng mở đúng chiếc máy; việc sao chép hoặc mở link không giữ máy và không cam kết giá. Khách khác vẫn có thể mua máy trước. Máy không còn bán được sẽ hiển thị theo trạng thái sản phẩm hiện tại, không tạo nguồn hàng riêng cho affiliate.

Hoa hồng dự kiến chỉ hỗ trợ lựa chọn máy. Hoa hồng thực tế được tính lại khi đặt hàng vì giá bán, voucher, giá vốn hoặc chính sách có thể đã thay đổi.

## 8. Ghi nhận lượt giới thiệu và chuyển đến sản phẩm

1. Trình duyệt người mua truy cập link `/r/{code}`.
2. Giao diện kiểm tra đường dẫn đích theo danh sách cho phép: trang chủ, danh sách sản phẩm hoặc chi tiết sản phẩm/máy trong rePhone. Địa chỉ ngoài hệ thống hoặc đường dẫn không hợp lệ trở về `/products`, tránh chuyển hướng đến website giả mạo.
3. Trình duyệt gửi mã giới thiệu đến API công khai `POST /api/v1/affiliate-program/referrals`.
4. Backend kiểm tra chương trình, hồ sơ cộng tác viên và trạng thái tài khoản chủ hồ sơ.
5. Nếu hợp lệ, backend tạo token ngẫu nhiên, lưu bản băm trong `AffiliateReferral` cùng thời hạn 30 ngày; trình duyệt nhận cookie HttpOnly, SameSite=Lax, phạm vi `/api/v1`, Secure khi chạy HTTPS.
6. Link hợp lệ mới ghi đè nguồn giới thiệu cũ trên cùng trình duyệt: cơ chế **last valid referral**. Link sai hoặc cộng tác viên không còn hoạt động không xóa cookie hợp lệ đã có.
7. Sau khi API xử lý, giao diện tự mở trang máy bằng thao tác thay thế địa chỉ lịch sử, không yêu cầu khách bấm “Tiếp tục”. Nếu dịch vụ ghi nhận lỗi hoặc chậm quá 3 giây, khách vẫn được chuyển đến sản phẩm; không cam kết ghi nhận thành công trong tình huống này.

**Giới hạn:** không theo dõi xuyên thiết bị/trình duyệt; mất/chặn cookie có thể mất ghi nhận. Lượt link trong dashboard là số bản ghi referral còn được lưu, không phải số người duy nhất hoặc lượt click tổng cộng trọn đời. Lượt truy cập đơn thuần không phát sinh tiền.

**Điểm cần giải thích trong đồ án:** cookie nhận diện người giới thiệu ở mức đơn bán lẻ, không buộc khách chỉ mua đúng chiếc máy xuất hiện trong link. Nếu khách chuyển sang iPhone đủ điều kiện khác rồi đặt hàng trong thời hạn ghi nhận, hoa hồng tính trên các dòng iPhone thực tế của đơn đó.

## 9. Ghi nhận hoa hồng khi checkout

Khách tiếp tục dùng giỏ hàng, voucher, thanh toán và nhận máy hiện có. Có thể mua bằng tài khoản hoặc theo luồng khách không đăng nhập. Link affiliate không tạo một quy trình checkout khác.

Trong transaction tạo đơn, `OrdersService` gọi `AffiliateLedgerService.capture`:

1. Đọc và kiểm tra cookie; tìm referral bằng bản băm token.
2. Kiểm tra referral chưa hết hạn, hồ sơ và tài khoản cộng tác viên còn hoạt động, chương trình đang mở và đã có đủ chính sách giá.
3. Chỉ xét đơn `STOREFRONT`.
4. Loại tự giới thiệu nếu trùng userId, email (chuẩn hóa chữ thường) hoặc số điện thoại người mua với hồ sơ/tài khoản cộng tác viên. Đây là kiểm tra theo dữ liệu đã cung cấp, không phải hệ thống nhận diện mọi hình thức gian lận.
5. Với từng dòng, chỉ xét IPHONE có InventoryUnit, giá vốn và không bị tắt hoa hồng. Lấy tỷ lệ riêng nếu có, nếu không dùng tỷ lệ chung.
6. Tính số tiền bằng số nguyên, làm tròn xuống và bảo vệ lợi nhuận.
7. Nếu có ít nhất một dòng hoa hồng dương, lưu một `AffiliateAttribution` cho đơn và một `AffiliateCommission` cho mỗi dòng đủ điều kiện. Nếu tất cả bằng 0 hoặc không hợp lệ, đơn bán lẻ vẫn tạo bình thường nhưng không có attribution/commission.

Unique constraint bảo đảm một nguồn giới thiệu cho mỗi đơn và một commission cho mỗi dòng hàng. Retry checkout theo cơ chế chống trùng của đơn không nhân đôi hoa hồng. Không gán bổ sung hoặc đổi nguồn affiliate cho đơn đã đặt.

### Công thức

```text
B = tiền dòng iPhone sau giảm giá/voucher, không gồm vận chuyển
F = giá vốn + chi phí bổ sung + dự phòng + lợi nhuận tối thiểu
r = tỷ lệ tính theo basis points (100 bps = 1%; tối đa 500 bps)

TheoTyLe = floor(B × r / 10000)
DuDiaLoiNhuan = max(0, B − F)
HoaHong = min(TheoTyLe, DuDiaLoiNhuan)
```

| Ví dụ | B | F | Tỷ lệ | Theo tỷ lệ | Hoa hồng chốt |
| --- | ---: | ---: | ---: | ---: | ---: |
| Dư lợi nhuận | 10.000.000đ | 9.000.000đ | 3% | 300.000đ | 300.000đ |
| Bị giới hạn | 10.000.000đ | 9.850.000đ | 3% | 300.000đ | 150.000đ |
| Không đủ lợi nhuận | 10.000.000đ | 10.000.000đ | 3% | 300.000đ | 0đ, không tạo commission |

Snapshot gồm phiên bản chính sách ở attribution; tỷ lệ, căn cứ tiền, mức bảo vệ và số hoa hồng gốc ở commission. Sửa chính sách/giá vốn sau checkout không thay đổi snapshot. Điều chỉnh do hoàn tiền vẫn được thực hiện theo snapshot gốc.

## 10. Theo dõi đơn và thời điểm khả dụng

Hoa hồng mới có trạng thái `PENDING`. Hệ thống chỉ cho khả dụng khi đơn `COMPLETED`, đã thu đủ tiền được xác minh và qua thời gian chờ:

```text
availableAt = max(completedAt, fullyPaidAt) + 14 ngày
```

`fullyPaidAt` được xác định từ các Payment đã VERIFIED, cộng dồn khoản thực nhận theo thời điểm duyệt cho đến khi đủ tổng tiền đơn. Ảnh chuyển khoản chưa được xác minh không làm đơn đủ tiền.

Ví dụ đơn thu đủ tiền ngày 01/10 nhưng hoàn tất ngày 03/10 thì bắt đầu có thể khả dụng ngày 17/10 cùng giờ. Nếu hoàn tất ngày 03/10 nhưng tới ngày 05/10 mới xác minh đủ tiền thì mốc là ngày 19/10 cùng giờ.

Nếu có yêu cầu hậu mãi chưa kết thúc, refund đang REQUESTED/PROCESSING hoặc khoản hoàn thiếu phân bổ cần đối soát, hoa hồng bị giữ. Khi vấn đề được giải quyết, hệ thống tính lại; không tự khởi động lại 14 ngày chỉ vì vừa đóng yêu cầu hậu mãi.

Đối soát chạy mỗi phút khi scheduler được bật, tối đa 100 đơn mỗi đợt và tiếp tục theo con trỏ. Admin cũng có nút đối soát thủ công. Yêu cầu rút và xử lý payout đều kiểm tra lại dưới khóa transaction, không chỉ dựa vào dữ liệu dashboard hoặc lần chạy scheduler gần nhất.

| Trạng thái commission | Ý nghĩa |
| --- | --- |
| PENDING | Chưa đủ điều kiện hoặc còn trong 14 ngày chờ |
| HELD | Đang vướng hậu mãi, refund hoặc cần đối soát phân bổ |
| AVAILABLE | Có thể đưa vào yêu cầu rút |
| RESERVED | Đã được dành cho một yêu cầu chi trả chưa giải phóng |
| PAID | Đã được ghi nhận chi trả; số đã chi lưu riêng |
| VOID | Sau đối soát không còn phát sinh tiền, ví dụ đơn hủy/hoàn |

Luồng thông thường: `PENDING → AVAILABLE → RESERVED → PAID`. `HELD` có thể xuất hiện trước khi khả dụng hoặc sau khi nguồn đơn phát sinh vấn đề. Khi đang RESERVED, khoản chi chuyển `NEEDS_REVIEW` nếu nguồn thay đổi; không giải phóng tiền ngay. Commission đã PAID tiếp tục giữ trạng thái PAID kể cả khi phát sinh hoàn sau đó.

## 11. Hủy đơn, hoàn tiền và hậu mãi

Khoản hoàn của đơn affiliate cần phân bổ theo ba loại: `ITEM` (dòng hàng), `SHIPPING` (phí giao) và `OVERPAYMENT` (tiền chuyển thừa). Hệ thống kiểm tra tổng phân bổ bằng khoản hoàn và không vượt hạn mức còn lại của từng loại. Luồng hủy tự phân bổ theo nghiệp vụ, căn cứ tiền thực nhận đã xác minh.

- Hoàn tiền dòng iPhone làm giảm căn cứ hoa hồng của đúng dòng đó.
- Hoàn phụ kiện, phí giao hoặc tiền chuyển thừa không trực tiếp làm giảm hoa hồng iPhone.
- Khi refund còn xử lý, có thể tạm giữ hoa hồng của đơn để tránh chi tiền trong lúc chưa chốt kết quả.
- Đơn hủy có hoa hồng mục tiêu bằng 0.
- Máy hoàn về đi theo kiểm định/tồn kho hiện có; affiliate không tự đưa máy về trạng thái bán được.

Cách tính lại khi refund hoàn thành:

```text
B_moi = B_goc − tiền đã hoàn cho dòng iPhone
HoaHongMucTieu = min(floor(B_moi × r_goc / 10000), max(0, B_moi − F_goc))
```

Không chỉ giảm hoa hồng theo tỷ lệ số tiền hoàn: mức bảo vệ lợi nhuận gốc vẫn được áp dụng. Với B=10 triệu, F=9 triệu, r=3%, hoàn 500.000đ cho máy thì hoa hồng mục tiêu là min(285.000đ, 500.000đ)=285.000đ. Hoàn 1 triệu thì căn cứ còn 9 triệu, dư địa bằng 0 và hoa hồng mục tiêu bằng 0.

Thay đổi được lưu bằng `AffiliateAdjustment`. Nếu chưa chi, cập nhật số còn hưởng. Nếu đã chi 300.000đ mà mục tiêu chỉ còn 285.000đ, hệ thống giữ `paidAmount=300.000`, ghi `absorbedLoss=15.000`; rePhone chịu khoản chênh lệch. Không tạo số dư âm, không truy thu và không trừ khoản hoa hồng tương lai.

## 12. Xác minh tài khoản nhận tiền

**Màn hình:** Cộng tác viên → Nhận hoa hồng.

1. Người dùng nhập ngân hàng, tên chủ tài khoản, số tài khoản và mật khẩu rePhone hiện tại.
2. Backend xác thực lại mật khẩu; mã hóa số tài khoản trước khi lưu. DTO thường chỉ có bốn số cuối.
3. Hệ thống gửi link xác nhận tới email tài khoản đăng nhập. Token có hạn 30 phút; chỉ lưu bản băm. Gửi lại phải chờ tối thiểu 60 giây, không tạo bản ghi trùng cho cùng thông tin đang được xử lý.
4. Người dùng mở link rồi bấm xác nhận. Token nằm trong fragment, được loại khỏi thanh địa chỉ; nếu cần đăng nhập, giao diện giữ tạm trong sessionStorage của tab để tiếp tục xác nhận sau đăng nhập.
5. Admin mở thông tin cần thiết để đối chiếu; việc đọc tài khoản đầy đủ được ghi audit. Admin xác minh sau khi email đã được xác nhận.
6. Tài khoản đầu tiên có hiệu lực sau khi được duyệt; tài khoản thay thế chờ 24 giờ theo chính sách hiện tại.

Lưu thông tin không đồng nghĩa gửi email thành công và không đồng nghĩa tài khoản đã được duyệt. Khi email gửi lỗi, giao diện thông báo hồ sơ đã lưu và hướng dẫn gửi lại để tránh người dùng hiểu nhầm rồi tạo bản ghi lặp.

Yêu cầu chi trả lưu snapshot ngân hàng tại lúc gửi; thay tài khoản mới không tự thay đích nhận của khoản đang xử lý.

## 13. Yêu cầu rút và chi trả

### Cộng tác viên gửi yêu cầu

Tiền điều kiện: hồ sơ ACTIVE hoặc SUSPENDED nhưng không bị `payoutHold`; tài khoản chủ đăng nhập hợp lệ; ngân hàng đã xác minh, có hiệu lực và chưa bị vô hiệu hóa; số khả dụng đạt 200.000đ; không có payout chưa kết thúc.

1. Cộng tác viên chọn rút toàn bộ số dư khả dụng. Phiên bản hiện tại không nhập số tiền rút tùy ý.
2. Client gửi `requestKey` và giữ nguyên khóa nếu cần thử lại khi chưa xác nhận kết quả.
3. Server kiểm tra replay theo cặp `(affiliateId, requestKey)`. Nếu đã tạo, trả lại yêu cầu cũ.
4. Server khóa các đơn nguồn và hồ sơ theo thứ tự thống nhất, đối soát lại tất cả nguồn có thể sử dụng.
5. Server chọn các commission AVAILABLE chưa gắn payout hiệu lực, cộng tổng và kiểm tra ngưỡng.
6. Tạo `AffiliatePayout` REQUESTED, snapshot ngân hàng và các `AffiliatePayoutItem` chứa số tiền từng dòng; chuyển commission sang RESERVED trong cùng transaction.

### Quản trị viên chi trả

1. Admin mở yêu cầu, kiểm tra số tiền và tài khoản nhận đã chốt.
2. Chuyển sang PROCESSING sau khi server kiểm tra lại điều kiện nguồn.
3. Admin thực hiện chuyển khoản ngoài rePhone. Hệ thống hiện tại không gọi ngân hàng để chuyển tự động.
4. Admin nhập mã giao dịch, thời điểm chuyển, ghi chú và tải chứng từ hợp lệ.
5. Server kiểm tra trạng thái, mã giao dịch duy nhất, chứng từ và thời điểm; ghi PAID cho payout và commission, lưu số tiền đã chi cùng audit.

| Trạng thái payout | Xử lý |
| --- | --- |
| REQUESTED | Chờ admin xử lý, tiền đã được dành riêng |
| PROCESSING | Đang thực hiện/ghi nhận chuyển khoản |
| NEEDS_REVIEW | Chưa chắc kết quả chuyển hoặc nguồn đơn đã thay đổi; tiếp tục giữ tiền |
| PAID | Đã ghi nhận chuyển thành công và chứng từ |
| REJECTED / CANCELLED | Kết thúc không chi, giải phóng liên kết giữ tiền rồi đối soát lại commission |

Nếu payout đã qua giai đoạn REQUESTED, việc hủy/từ chối để giải phóng tiền cần xác nhận ngân hàng chưa chuyển. Timeout không được coi là thất bại tài chính. Nếu đã chuyển thật dù nguồn đơn vừa phát sinh refund, vẫn phải ghi nhận giao dịch đã chi và phần tổn thất của rePhone, không xóa sự thật của giao dịch.

## 14. Mô hình dữ liệu và điểm tích hợp

| Bảng/mô hình | Trách nhiệm |
| --- | --- |
| AffiliatePolicy | Bật/tắt, tỷ lệ, dự phòng, lãi tối thiểu, phiên bản |
| AffiliateProfile | Chủ hồ sơ, mã link, trạng thái, điều khoản, cờ giữ chi trả |
| AffiliateInventoryOverride | Tỷ lệ riêng/bật tắt theo một InventoryUnit |
| AffiliateReferral | Token băm, nguồn giới thiệu, thời điểm tạo/hết hạn |
| AffiliateAttribution | Liên kết một đơn với một cộng tác viên |
| AffiliateCommission | Hoa hồng từng dòng máy, snapshot, trạng thái, đã chi và tổn thất |
| AffiliateAdjustment | Lịch sử điều chỉnh số tiền do đối soát |
| AffiliateBankAccount | Ngân hàng mã hóa và các mốc xác nhận/xác minh/hiệu lực |
| AffiliatePayout | Một yêu cầu rút, tổng tiền, snapshot ngân hàng, giao dịch và chứng từ |
| AffiliatePayoutItem | Phân bổ khoản rút về từng commission, trạng thái liên kết hiệu lực |

Quan hệ chính: User 1–1 AffiliateProfile; Profile 1–N Referral/Attribution/BankAccount/Payout; Order 0–1 Attribution; Attribution 1–N Commission; OrderItem 0–1 Commission; Commission 1–N Adjustment; Payout 1–N PayoutItem. Một commission có thể xuất hiện trong lịch sử yêu cầu đã hủy, nhưng tối đa một liên kết payout đang hiệu lực.

Kiến trúc tiếp tục là modular monolith NestJS + PostgreSQL/Prisma và Next.js. `AffiliateCoreModule` chứa công thức, cấu hình môi trường và ledger; `AffiliatesModule` cung cấp nghiệp vụ hồ sơ, truy vấn và chi trả. Module Orders gọi capture trong transaction checkout. Refunds gọi kiểm tra phân bổ và đối soát, dùng cùng khóa đơn với payout. Fulfillment cung cấp thông tin affiliate cần thiết cho backoffice xử lý khoản hoàn. Không tạo một engine kho máy/thanh toán bán lẻ mới.

Các nhóm API: `/affiliate-program` công khai; `/affiliate/*` cho chủ hồ sơ; `/backoffice/affiliates/*` cho ADMIN. API ngân hàng đầy đủ/chứng từ riêng tư được tách khỏi danh sách thường. Không đưa giá vốn, mức sàn, thông tin cá nhân người mua hoặc chứng từ thanh toán của khách vào portal cộng tác viên.

## 15. Bất biến và xử lý đồng thời

1. Mỗi đơn tối đa một attribution; mỗi dòng máy tối đa một commission.
2. Client không được tự quyết định tỷ lệ, số tiền, chủ sở hữu hoặc trạng thái chi trả.
3. Chỉ tiền được xác minh mới đóng góp vào điều kiện thu đủ của đơn.
4. Tiền một commission không được đồng thời dành cho hai payout hiệu lực.
5. Mỗi cộng tác viên tối đa một payout REQUESTED/PROCESSING/NEEDS_REVIEW.
6. Mã giao dịch chuyển tiền không được dùng cho hai payout.
7. Khóa idempotency có phạm vi theo cộng tác viên; thử lại không nhân đôi khoản rút.
8. Refund và payout dùng chung thứ tự khóa đơn để tránh hai giao dịch cùng sử dụng điều kiện tiền lỗi thời.
9. Số đã chi không được xóa chỉ vì nguồn đơn thay đổi; ghi nhận tổn thất riêng.
10. Sửa ngân hàng hoặc chính sách hiện tại không làm thay snapshot payout/đơn đã tạo.

Các ràng buộc được đặt ở cả dịch vụ và database, kết hợp transaction Serializable và khóa hàng. Hệ thống không chỉ dựa vào việc ẩn/khóa nút trên giao diện.

## 16. Thay đổi so với hệ thống trước khi có affiliate

| Khía cạnh | Trước | Sau |
| --- | --- | --- |
| Kênh kinh doanh | Bán lẻ và đại lý mua lại | Thêm kênh giới thiệu một cấp |
| Nguồn đơn | Chưa có attribution affiliate | Cookie hợp lệ được chốt thành nguồn của đơn |
| Giá/lợi nhuận | Giá bán lẻ và giá đại lý | Thêm chi phí hoa hồng, giới hạn để giữ lợi nhuận |
| Checkout | Tạo đơn, giữ tồn, yêu cầu thanh toán | Thêm snapshot hoa hồng trong cùng transaction khi đủ điều kiện |
| Hoàn tiền | Xử lý nghĩa vụ hoàn của đơn | Đơn affiliate thêm phân bổ và điều chỉnh hoa hồng tương ứng |
| Theo dõi tiền giới thiệu | Chưa có | Có sổ hoa hồng, khoản rút và lịch sử điều chỉnh |
| Ngân hàng đối tác | Ngân hàng đại lý phục vụ nhận hoàn | Thêm ngân hàng cộng tác viên phục vụ nhận hoa hồng, sổ riêng |
| Vận hành admin | Quản trị bán lẻ/đại lý | Thêm duyệt CTV, chính sách, đối soát và xác nhận chi |
| Tài khoản khách | Hồ sơ, đơn, địa chỉ, bảo hành | Thêm lối vào CTV khi đã có hồ sơ |
| Mở link giới thiệu | Bản giao diện ban đầu có trang thông báo và nút bấm tiếp | Tự ghi nhận rồi mở trực tiếp trang máy |
| Trang chương trình | Khung tài khoản có thanh bên, giới thiệu ngắn | Trang giới thiệu công khai và workspace rộng theo giao diện web |
| Trang yêu cầu đăng nhập | Hiển thị thông báo yêu cầu tự bấm đăng nhập | Tự chuyển sang login và giữ địa chỉ quay lại |

Các quy tắc tồn kho vật lý, đặt hàng bán lẻ và đơn đại lý tiếp tục sử dụng engine hiện có. Luồng mua không tài khoản, xem đơn/bảo hành bằng quyền truy cập khách hợp lệ được giữ; danh sách riêng tư `/account`, `/orders`, `/wishlist`, `/after-sales`, `/warranties` mới tự chuyển login khi chưa đăng nhập.

## 17. Kịch bản minh họa cho phần trình bày đồ án

**Luồng chính:** Admin cấu hình 3%; duyệt CTV A. A sao chép link chiếc iPhone 13. Khách B mở link và vào đúng máy; B đặt hàng với thông tin không trùng A. Máy có tiền sau giảm 10 triệu, mức bảo vệ 9 triệu nên hệ thống chốt 300.000đ PENDING. Đơn được giao thành công và xác minh đủ tiền. Qua 14 ngày, không phát sinh vấn đề, hoa hồng AVAILABLE. A xác minh ngân hàng, gửi yêu cầu rút toàn bộ. Admin đối soát, thực hiện chuyển khoản thử trong kịch bản demo rồi ghi chứng từ; payout và commission PAID.

**Luồng thay thế nên trình bày:** khách mở link A rồi B (B hợp lệ được ghi nhận); link B sai (không xóa nguồn A); tự mua (không có hoa hồng); thiếu giá vốn (đơn vẫn tạo, không có commission); hoàn tiền trước rút (tính lại); hoàn trong lúc chi (NEEDS_REVIEW); hoàn sau đã chi (ghi tổn thất); bấm rút lặp (chỉ một yêu cầu); đổi ngân hàng khi đang có khoản chi (giữ snapshot cũ).

## 18. Giới hạn hiện tại và hướng phát triển

- Việc duyệt hồ sơ/ngân hàng và chuyển khoản còn thủ công; không tuyên bố có KYC ngân hàng tự động.
- Chống tự giới thiệu theo user/email/điện thoại; chưa có chấm điểm gian lận chuyên sâu hoặc nhận dạng nhiều tài khoản cùng người.
- Attribution dựa vào cookie cùng trình duyệt, không phải hệ thống quảng cáo theo dõi đa thiết bị.
- Tiền trên UI là sổ theo dõi nghĩa vụ chi trả; không phải ví thanh toán dùng mua hàng/chuyển tiền.
- Doanh thu/hoa hồng hiển thị trong thử nghiệm chưa chứng minh hiệu quả kinh doanh thực tế.
- Thời gian chờ, ngưỡng rút và trần tỷ lệ hiện được quy định trong v1; việc mở rộng thành cấu hình linh hoạt cần thêm version chính sách và kiểm thử.
- Đối soát ngân hàng tự động, báo cáo chiến dịch chuyên sâu, mã giảm giá gắn CTV, công cụ chống gian lận và xử lý thuế là các hướng phát triển, không mô tả là đã hoàn thành.

## 19. Tài liệu và mã nguồn đối chiếu

- [Phạm vi và bất biến](./affiliate-channel.md)
- [Cách chạy và luồng kiểm thử](../runbooks/affiliate-channel.md)
- Công thức: `apps/api/src/modules/affiliate-core/affiliate.policy.ts`.
- Snapshot/đối soát/refund: `apps/api/src/modules/affiliate-core/affiliate-ledger.service.ts`.
- Hồ sơ/ngân hàng: `apps/api/src/modules/affiliates/affiliate-profile.service.ts`.
- Link, catalog, dashboard, scheduler: `apps/api/src/modules/affiliates/affiliate-query.service.ts`.
- Rút/chi/chứng từ: `apps/api/src/modules/affiliates/affiliate-payout.service.ts`.
- Dữ liệu và ràng buộc: `apps/api/prisma/schema.prisma`, hai migration `20261010090000_affiliate_channel` và `20261010091000_affiliate_ledger_invariants`.
- Kiểm thử nghiệp vụ: `apps/api/test/e2e/affiliates.e2e.spec.ts`.
- Giao diện CTV/admin: `apps/web/components/affiliate/`; giới thiệu chương trình: `apps/web/components/partners/`; chuyển link: `apps/web/app/r/[code]/page.tsx`.

Tài liệu phản ánh hành vi phần mềm; các thủ tục hợp đồng, chứng từ và nghĩa vụ thuế khi vận hành thực tế cần được xác định riêng theo mô hình kinh doanh áp dụng.
