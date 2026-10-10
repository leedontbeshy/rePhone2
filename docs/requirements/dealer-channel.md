# Cổng đại lý — Spec v1.0

Ngày chốt: 2026-10-09. Trạng thái: hợp đồng nghiệp vụ đã chốt; tiến độ triển khai theo [backlog](../planning/2026-10-09-dealer-channel.md). Tài liệu này không khẳng định API đại lý đã hoạt động.

## 1. Phạm vi

- Mô hình `DEALER_RESALE`: đại lý bán và thu tiền khách, rePhone bán cho đại lý, kiểm định, giao trực tiếp và thực hiện bảo hành.
- LIVE chỉ nhận hộ kinh doanh/doanh nghiệp được duyệt; cá nhân có thể dùng sandbox. Một tài khoản chủ mỗi đại lý trong v1.
- Một iPhone vật lý mỗi đơn; tồn kho/reservation dùng chung storefront. Không tạo cart giả.
- Đại lý tự đặt giá bán. rePhone thu đủ giá đại lý + phí giao trước bàn giao. Không thu hộ, COD, công nợ, ví, thanh toán gộp nhiều đơn hoặc chuyển số dư sang đơn khác.
- Hoàn tiền rePhone → đại lý; đại lý → khách là giao dịch riêng. Khoản hoàn cho khách không mặc nhiên bằng khoản rePhone hoàn đại lý.
- Giữ affiliate, AI, phụ kiện, đơn nhiều máy, phân hạng đại lý, API ngân hàng/vận đơn, website builder và SMTP theo đại lý ngoài v1.

## 2. Chủ thể, hồ sơ và quyền

Server tạo snapshot thương mại gồm `commercialModel`, danh tính bên bán, nhà cung cấp, đơn vị giao/bảo hành, người thu tiền khách và người nhận hoàn. Không cho client thiết lập tùy ý các vai trò này. Đại lý phụ trách chứng từ bán cho khách; rePhone phụ trách chứng từ bán cho đại lý theo phương án kế toán được xác nhận trước LIVE.

Hồ sơ gồm legalName, businessType, taxCode, representativeName, businessAddress, contactName/email/phone, approvedDomains, branding, contractVersion/acceptedAt, approval actor/history, riskLevel và refund bank account version đã xác minh. Domain là chính sách sử dụng thương hiệu, không thay credential server-to-server.

Hai trục độc lập:

- businessStatus: `PENDING | ACTIVE | REJECTED | BUSINESS_SUSPENDED | CLOSED`.
- securityStatus: `NORMAL | SECURITY_LOCKED`.

`BUSINESS_SUSPENDED` và `CLOSED` chặn catalog/new order/new key; credential còn hợp lệ vẫn xử lý đơn và hậu mãi cũ. Việc truy cập cũ luôn cần scope và ownership. `SECURITY_LOCKED` thu hồi session/key và chặn webhook tới đối tác; backoffice tiếp quản. Khôi phục bảo mật không đổi trạng thái kinh doanh và không phục hồi key đã thu hồi. Không dùng `UserStatus.SUSPENDED` để biểu diễn đình chỉ kinh doanh.

Thay tài khoản hoàn: re-auth → email token một lần → admin duyệt → cooling period mặc định 24h. Giữ snapshot người nhận của refund đang xử lý. Báo mất an toàn đặt payout hold; không âm thầm thay người nhận hoặc giải phóng quota.

## 3. Giá, vận chuyển và snapshot

Giá sàn = acquisitionCost + additionalCost thực tế + dự phòng chưa ghi trong additionalCost + lãi đóng góp tối thiểu. Giá đại lý = max(giá công khai sau chiết khấu, giá sàn); một chính sách chung, override từng máy vẫn phải đạt sàn. Thiếu vốn/cấu hình hoặc giá đại lý >= giá công khai: không mở catalog đại lý. Khoản dự phòng không bị cộng hai lần. Lãi đóng góp không phải lợi nhuận ròng doanh nghiệp.

Money là Decimal(15,0)/bigint nội bộ, chuỗi chữ số VND trên API, không dùng float. Chiết khấu tính theo basis points; kết quả chia làm tròn lên tới một VND. Giá/cost dùng cùng cơ sở thuế đã được vận hành xác nhận. Không áp voucher bán lẻ.

Phí giao cố định trong vùng phục vụ được cấu hình, chính sách có version. Ngoại lệ trả `SHIPPING_QUOTE_REQUIRED`, nhân viên báo giá theo dealer + fingerprint địa chỉ trước giữ máy. Quote đề xuất hiệu lực 24h, chỉ cam kết phí giao, không cam kết máy/giá máy. Đổi địa chỉ vô hiệu quote. Snapshot giá máy, phí/nguồn phí, giá tham chiếu, policy version, bảo hành, branding, commercial parties và người nhận khi tạo đơn.

## 4. Đặt đơn và thời hạn

Preview không giữ hàng hoặc cam kết giá; create tính lại dữ liệu server. Khác fingerprint báo giá cần conflict và xác nhận lại. Cùng transaction tạo Order + một OrderItem + reservation + snapshot + PaymentRequest + idempotency record + outbox. Không có I/O ngoài database trong transaction. Storefront và dealer tranh máy qua cùng partial unique reservation và gateway.

Unique `(dealerId, externalOrderId)`; scope idempotency theo dealer + command. Cùng key/payload trả kết quả cũ trước khi kiểm tra lại preview. Khác payload trả conflict. Key mới cùng externalOrderId/payload trả đơn cũ; khác payload conflict. Retry đơn hủy không tạo đơn mới. Lưu idempotency cùng vòng đời đơn, không chỉ cache.

Mặc định: hold submission 30 phút, balance 30 phút, cảnh báo review 120 phút, tối đa 3 đơn chưa đủ tiền tính cả review/balance. Dùng giờ database trong transaction, lưu timestamptz UTC; không tin thời gian client.

- Submit đúng hạn lưu thời gian còn lại, pause expiry; reservation vẫn ACTIVE, holdReason REVIEW.
- Reject proof ban đầu chỉ phục hồi thời gian còn lại. Proof đã terminal không sửa, nộp lại tạo bản mới; không chấp nhận cùng chứng từ đã reject để mở chu kỳ giữ máy khác.
- Nhận thiếu đặt balanceDeadlineAt một lần. Mọi top-up sau giữ nguyên deadline, kể cả review kết thúc sau deadline.
- Đang review không auto-release. Duyệt xong còn thiếu và deadline đã qua thì hủy/đối soát.
- Job expiry phải recheck trạng thái Order và funding dưới lock; không chỉ kiểm tra timestamp.
- Tiền tới sau hủy vẫn ghi nhận nhưng không khôi phục Order/reservation.
- Theo dõi rejected/expired/hold time; giảm hạn mức hoặc chặn đơn mới khi nhân viên xác nhận rủi ro. Cưỡng chế release đi qua cancellation có audit, không xóa nghĩa vụ tiền.

## 5. Sổ tiền

PaymentRequest là yêu cầu thu; PaymentProof là chứng từ; BankTransaction là tiền thực nhận được nhân viên xác minh; PaymentAllocation là phân bổ nguồn tiền vào đơn. Không chuyển ảnh thành tiền. Một đơn có thể có nhiều lần chuyển. Giao dịch chưa xác định chủ/đơn nằm trong đối soát, chưa hiển thị cho đại lý chưa xác minh sở hữu.

BankTransaction và allocation đã ghi không sửa/xóa; điều chỉnh bằng record có tham chiếu gốc và audit. Một record correction không thể được thực thi hai lần. FULL_PAYMENT bị SUPERSEDED khi mở BALANCE; grandTotal là nghĩa vụ gốc, không cộng requiredAmount của hai request.

Với một receipt, R = tiền thực nhận sau các điều chỉnh có thể thực hiện an toàn; A = tổng allocation trừ reversal; U = nghĩa vụ hoàn trực tiếp từ phần chưa phân bổ (REQUESTED/PROCESSING/COMPLETED). Luôn A + U <= R. Refund dựa trên allocation đã nằm trong A, không trừ lần hai trong phép tính quota receipt. Với mỗi allocation, refund đang giữ quota và đã hoàn <= allocation còn hiệu lực.

Funding của đơn = allocation còn hiệu lực − refund obligations dựa trên allocation. Chỉ giao khi funding đủ grandTotal. Tiền thừa không phân bổ vào đơn; hoàn tiền thừa không làm mất funding. Phân biệt tiền đã chuyển hoàn (COMPLETED) và tiền đang giữ hạn mức (cả ba trạng thái). Refund không tự mở lại nghĩa vụ thu của đơn hủy/hoàn.

Refund có nguồn rõ: allocation hoặc receipt chưa phân bổ; một nghĩa vụ chỉ có một nguồn. Một lần hoàn toàn bộ đơn có nhiều nguồn tạo các nghĩa vụ theo nguồn, đối soát tổng theo case; v1 không ghép một refund record vào nhiều nguồn. Có thể có refund không có Order nếu nguồn là receipt chưa phân bổ; không tạo Order giả.

Money mutations dùng một transaction boundary và thứ tự lock: Order nếu có → BankTransaction theo ID → PaymentRequest/Allocation theo ID → Refund theo ID. Nhánh receipt chưa có đơn không được lấy lock Order sau receipt; resolve đối tượng trước transaction. Serializable/retry như baseline. Gateway retail tiếp tục dùng nguồn Payment cũ; projection dealer không được làm nguồn tiền song song.

Sửa sai sau giao hàng hoặc sau khi có refund obligation phải mở reconciliation case và chặn tác vụ có thể gây thêm thiệt hại. Không giả lập đảo khoản đã chuyển ngân hàng; lưu nguyên chứng cứ và xử lý sự cố. Chính sách thuần chỉ quyết định hướng xử lý, không thay thế locks/database và kiểm tra quyền.

## 6. Giao nhận, hậu mãi và thông báo

Kiểm tra funding khi prepare và handover; không tạo COD lúc delivered. Handover consume reservation một lần. Khách từ chối/sai địa chỉ do đại lý: chịu phí đi/về thực tế theo thỏa thuận, đối trừ phí đã thu. Lỗi rePhone: rePhone chịu. Hàng trả thực nhận về chuyển INSPECTING, không tự AVAILABLE.

Sửa/đổi tương đương theo warranty; máy thay thế dùng reservation chung. Đổi khác giá: hoàn đơn cũ + đơn mới độc lập, không sửa snapshot, không lấy refund chưa chuyển làm tiền đơn mới. Tách finding/cause/coverage; hỗ trợ UNDETERMINED. Thời hạn bảo hành cần theo dõi thời gian sửa và thời điểm thay linh kiện/đổi máy, không chỉ đổi inventoryUnitId.

Khách thấy bên bán là đại lý, đơn vị kiểm định/bảo hành rePhone, liên hệ đại lý và hỗ trợ dự phòng rePhone. Email dùng hạ tầng rePhone. Khách không thấy giá sỉ/QR thanh toán rePhone; không serialize snapshot nội bộ. Dealer API không có giá vốn, dự phòng, lợi nhuận nội bộ, IMEI đầy đủ hoặc bằng chứng ngân hàng riêng tư.

Đại lý đóng cửa: nhân viên rePhone tiếp nhận mã bảo hành và chứng từ mua/nhận; v1 không làm SMS OTP. Không vô hiệu quyền đã phát hành. Không tự hoàn trực tiếp khách khi nghĩa vụ hoàn đại lý chưa giải quyết.

## 7. Tích hợp và rollout

Contract/scope/webhook: [API dealer](../api/dealer-channel-contract.md). Quy tắc chuyển trạng thái: [ma trận chuẩn](../architecture/state-machines.md#12-dealer-channel--spec-v10). Invariant và acceptance: [danh mục](../quality/dealer-invariants.md).

Sandbox dùng cùng nghiệp vụ nhưng deployment/database/storage/keyring/mail sink riêng. Client không chọn TEST/LIVE qua payload; không đổi đơn TEST sang LIVE. Fake payment/shipment chỉ có trên TEST; key hai môi trường không dùng chéo.

ADMIN mở/tạm đóng nhận hồ sơ và đơn mới bằng UI, dùng `DealerPricingPolicy.enabled`, yêu cầu sàn lợi nhuận đã cấu hình, kiểm tra version và audit. Tạm đóng giữ truy cập profile, đơn cũ, thanh toán và hậu mãi. `DEALER_ENABLED` là điều kiện hạ tầng/bảo trì được cấu hình ở server, không sửa từ HTTP. Trạng thái hạ tầng và trạng thái nhận kinh doanh mới được hiển thị riêng. Môi trường và khóa mã hóa không thay đổi bằng nút này.

LIVE sau nghiệm thu DB/API/concurrency, phương án chứng từ/hợp đồng/dữ liệu/bảo hành và nhân sự vận hành. Pilot 2–3 đại lý; feature flag dừng nhận đơn mới nhưng giữ xử lý đơn/tiền/hậu mãi cũ. Đối soát hằng ngày, đo hold time, thời gian review, failed delivery và contribution thực tế trước mở rộng.
