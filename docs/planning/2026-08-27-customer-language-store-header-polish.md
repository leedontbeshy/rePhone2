# Customer language, store and header polish

> Trạng thái: **APPROVED**
> Ngày: `2026-08-27`
> Branch: `feat/fe-2-auth-account`
> Design authority: [design.md](../../design.md)

## Understanding summary

- Cân nhãn và control của `Họ và tên` với `Số điện thoại` trên desktop; mobile tiếp tục xếp một cột.
- Loại bỏ chi tiết triển khai và thuật ngữ code khỏi auth/account/customer-facing copy.
- Chuẩn hóa storefront sang tiếng Việt tự nhiên, không trộn `pickup`, `checkout`, `catalog`, `token` hoặc `session` vào câu dành cho khách.
- Tinh chỉnh `/store` thành một trang thông tin rõ điện thoại, địa chỉ, nhận máy và hành động tiếp theo.
- Tăng kích thước shared storefront header; menu desktop căn giữa, giãn đều và có hit target đủ lớn.
- Lưu hai quy ước nội dung làm mặc định cho các phase frontend sau.

## Assumptions and non-functional requirements

- Quy tắc copy áp dụng cho storefront, auth, account và customer post-purchase; backoffice, code, log và tài liệu contract vẫn được dùng thuật ngữ kỹ thuật khi cần.
- Giữ tên riêng và từ phổ biến như `rePhone`, `iPhone`, `email`; `Voucher` hiển thị thành `Ưu đãi` hoặc `Mã ưu đãi`.
- Không đổi API, schema, auth/session behavior hoặc dữ liệu public store.
- Không thêm dependency hoặc asset; tái sử dụng token, CSS Module và Phosphor icon hiện có.
- Không suy diễn giờ mở cửa, trạng thái đang mở hoặc location khác khi contract chưa cung cấp.
- Giữ SSR, keyboard behavior, WCAG 2.2 AA, responsive 320/390px và không horizontal overflow.

## Approaches considered

1. **Selected — refine shared foundations:** sửa layout tại component owner, làm rõ store information hierarchy và giữ header desktop hai tầng cân giữa. Phạm vi vừa đủ, regression thấp.
2. Header một hàng: gọn nhưng chật ở laptop nhỏ, cần thay đổi nhiều breakpoint và interaction.
3. Vá tối thiểu: nhanh nhưng không giải quyết hierarchy `/store` hoặc tính nhất quán lâu dài.

## Final design

### Account form

Hai field trong profile grid không stretch nội dung theo chiều cao của field có hint. Label và control bắt đầu cùng trục; breakpoint hiện tại tiếp tục chuyển thành một cột.

### Customer-facing language

Copy chỉ mô tả kết quả, quyền riêng tư và bước tiếp theo mà khách cần biết. Thông báo lỗi từ backend được map sang câu an toàn thay vì echo chi tiết provider/transport. Các nhãn `pickup`, `checkout`, `catalog`, `Voucher`, `Menu`, `Backoffice` trên surface khách được chuẩn hóa sang tiếng Việt.

### Store

Trang gồm introduction ngắn, store card chia vùng liên hệ và nhận máy, CTA gọi cửa hàng và mở bản đồ, sau đó là lưu ý trước khi đến nhận. Mobile xếp một cột; không tạo dữ liệu mới ngoài public projection.

### Header

Desktop giữ hai tầng: hàng chính tối thiểu `72px`, hàng navigation tối thiểu `48px`. Navigation dùng chữ `16px`, hit target tối thiểu `44px`, nằm giữa container và giãn đều. Mobile giữ shell gọn, mở danh mục bằng sheet và đánh dấu route hiện tại.

## Decision log

| Decision | Alternatives | Reason |
| --- | --- | --- |
| Refine shared foundations | One-row header; minimal patch | Cải thiện rõ rệt nhưng giữ component/API hiện hành và giảm regression |
| Customer surfaces use natural Vietnamese | Translate code/internal surfaces too | Phù hợp người mua mà không làm mờ contract vận hành |
| Derive map CTA from public address | Add opening hours/map provider data | Không mở rộng API hoặc tạo claim chưa có authority |
| Persist copy rules in design authority and Product Design context | Remember only in this task | Các phase sau áp dụng mặc định và kiểm tra được trong review |

## Verification contract

- Unit assertions cho store copy/action và safe customer error mapping.
- Browser geometry cho profile label/control alignment ở desktop.
- Browser assertions cho centered header navigation, active mobile item, CTA contrast và `/store` desktop/mobile.
- Axe serious/critical, keyboard interaction và horizontal overflow ở `1440`, `390` và `320`.
