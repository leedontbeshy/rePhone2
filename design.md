# rePhone Design System & UI Contract v2.1

> Trạng thái thiết kế: **APPROVED — bộ UI được chọn ngày 12/10/2026**
>
> Trạng thái triển khai: **DONE — UI 2.1 đã qua nghiệm thu trên source cuối; migration Supabase dev được cho phép, áp dụng và kiểm tra thành công**
>
> Phạm vi: storefront, đăng nhập/đăng ký, đặt hàng, backoffice nhân viên/admin và các màn hình kế thừa
>
> P0 baseline: [plan.md](plan.md)
>
> Backend contract: [docs/readme.md](docs/readme.md)
>
> Frontend implementation plan: [plan-fe.md](plan-fe.md)
>
> Kế hoạch triển khai UI v2.0 hiện tại: [UI v2.0 rollout plan](docs/planning/2026-10-12-ui-v2-rollout-plan.md)
>
> Baseline lịch sử v1.x: `801ad26` (không phải xác nhận triển khai v2.0)
>
> Ngày cập nhật: `2026-10-13`

## Bộ UI đã chốt

Phản hồi ngày 13/10/2026 trong [kế hoạch tinh chỉnh](docs/planning/2026-10-13-ui-v2-refinement.md) bổ sung và thay thế các phần tương ứng của sáu ảnh gốc: tăng độ nổi, trang chủ ưu tiên máy đang bán, bộ lọc ngang và tổng quan tài chính. Các ảnh selected giữ nguyên để lưu lịch sử; nội dung đã cập nhật dưới đây là chuẩn triển khai hiện tại.

Đây là **nguồn chuẩn về UI cho các lần triển khai tiếp theo**. Ngôn ngữ chung: nền sáng, chữ deep ink, hành động teal, nền ảnh cyan/lavender, ảnh sản phẩm có chiều sâu, khối bo mềm và khoảng trắng rõ ràng. Backoffice dùng sidebar deep ink và vùng làm việc sáng.

| Màn hình          | Route/phạm vi                            | Ảnh đã chọn                                                    | Hướng bố cục                                                                                     |
| ----------------- | ---------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Trang chủ         | `/`                                      | [home.png](docs/assets/ui/selected/home.png)                   | Curated Bento: một ô lớn trái, hai ô nhỏ phải, bộ lọc dòng máy và grid sản phẩm                  |
| Chi tiết dòng máy | `/products/[slug]`                       | [product-model.png](docs/assets/ui/selected/product-model.png) | Panoramic Studio: banner ngang, dải thông số, thẻ máy nằm ngang trong grid hai cột               |
| Chi tiết một máy  | `/products/[slug]/units/[inventoryCode]` | [product-unit.png](docs/assets/ui/selected/product-unit.png)   | Soft Studio Purchase: ảnh trái và mua hàng phải trên cùng nền cyan; ba ô tình trạng phía dưới    |
| Đặt hàng          | `/checkout`                              | [checkout.png](docs/assets/ui/selected/checkout.png)           | Soft Split Review: biểu mẫu trái, tổng đơn phải; khoản đặt trước được tách rõ                    |
| Đăng nhập/đăng ký | `/login`, `/register`                    | [auth.png](docs/assets/ui/selected/auth.png)                   | Quiet Centered Access: form giữa, ảnh studio và mảng cyan/lavender ở hai rìa                     |
| Backoffice        | `/backoffice`, `EMPLOYEE` và `ADMIN`     | [backoffice.png](docs/assets/ui/selected/backoffice.png)       | Sidebar tối; nội dung tài chính theo tháng, card chỉ số và biểu đồ/bảng ngày theo phản hồi 13/10 |

`auth.png` gồm đăng nhập ở nửa trên, đăng ký ở nửa dưới. `backoffice.png` gồm nhân viên ở nửa trên, admin ở nửa dưới. Đây là hai trạng thái/màn hình riêng, **không triển khai cả hai nửa ảnh lên cùng một route**. Nguồn file, ngày chọn và SHA-256 được lưu tại [selections.json](docs/assets/ui/selected/selections.json).

Sáu ảnh trên thay thế authority về presentation của các mockup cũ. Ảnh khóa bố cục, hierarchy, tỷ lệ vùng nội dung, style ảnh, component và vị trí hành động; các mục dưới chuẩn hóa thành token và quy tắc có thể triển khai. Không dùng toàn bộ PNG làm nền trang hoặc cắt ảnh mockup để giả thành UI hoạt động.

Giá, tên máy, ngày, khách hàng, số đếm, chính sách và trạng thái trong ảnh là dữ liệu minh họa. Lấy dữ liệu từ contract hiện hành; sửa lỗi chữ/diacritics của ảnh khi có. Không đưa các claim như “36 bước”, “đã gồm VAT”, miễn phí giao hàng hoặc ETA vào code nếu chưa có nguồn hợp lệ. Không sinh ảnh máy thật từ ảnh minh họa studio.

## 1. Mục đích và cách sử dụng

`design.md` là nguồn quy ước cho cách giao diện rePhone được tổ chức, hiển thị và tương tác. Tài liệu dành cho developer, reviewer, người viết nội dung và người kiểm thử frontend.

Tài liệu này quyết định:

- Visual direction, design tokens và responsive behavior.
- Information hierarchy và navigation theo từng surface.
- Component contract, interaction state và accessibility behavior.
- Quy tắc nội dung, hình ảnh, icon và feedback.
- Tiêu chí để một page được xem là conformant với hệ thống thiết kế.

Tài liệu này không quyết định:

- Role hoặc quyền truy cập thực sự.
- Request/response DTO, endpoint, error code hoặc pagination contract.
- State transition, transaction, pricing, reservation hoặc inventory invariant.
- Chính sách bảo hành, hoàn tiền, giao nhận hoặc kiểm định.

Khi triển khai một page:

1. Đọc contract nghiệp vụ liên quan trong `docs`.
2. Đọc page pattern và component contract trong file này.
3. Đọc work package tương ứng trong [kế hoạch UI v2.0](docs/planning/2026-10-12-ui-v2-rollout-plan.md); dùng `plan-fe.md` để kiểm tra coverage nghiệp vụ hiện hành.
4. Dùng generated API client; không tự tạo transport hoặc DTO song song.
5. Kiểm tra responsive, keyboard, loading, empty, error và conflict trước khi đánh dấu hoàn thành.

Một page conformant phải:

- Chỉ hiển thị claim có nguồn authority.
- Dùng token và component đã định nghĩa thay vì hard-code style mới.
- Hoạt động ở các viewport đã khóa.
- Không phá auth, ownership, guest credential hoặc security transport.
- Có đủ trạng thái ngoài happy path.
- Qua checklist Design QA tại §22.

## 2. Nguồn sự thật và precedence

Thứ tự ưu tiên khi có khác biệt:

1. `docs/requirements`, `docs/architecture`, `docs/data-model`, `docs/api` và `docs/quality` theo [source precedence](docs/readme.md#nguồn-sự-thật-khi-có-trùng-nội-dung).
2. OpenAPI và generated client phải khớp `docs`; nếu lệch, đó là blocker cần sửa đồng bộ.
3. `design.md` quyết định presentation/interaction khi contract không quy định.
4. [Kế hoạch UI v2.0](docs/planning/2026-10-12-ui-v2-rollout-plan.md) quyết định thứ tự, trạng thái và evidence visual migration hiện tại; `plan-fe.md` giữ coverage và lịch sử triển khai nghiệp vụ.
5. CSS/component hiện hành là implementation; không tự trở thành contract chỉ vì đã tồn tại.
6. Sáu mockup đã chọn trong bảng đầu tài liệu và §25.1 khóa presentation cho đúng surface; token/page pattern v2.0 chuẩn hóa chi tiết từ ảnh. Ảnh không override nghiệp vụ, security hoặc dữ liệu ở mục 1–2. Token/CSS cũ phải được migrate khi triển khai, không dùng làm lý do để quay lại layout cũ.
7. Website bên ngoài, mockup lịch sử và reference chưa được duyệt chỉ là inspiration, không phải requirement.

### 2.1 Contract-source map

| Khu vực UI                          | Nguồn authority tối thiểu                                                                                     |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Scope và non-goal                   | [Product vision](docs/requirements/product-vision-and-scope.md)                                               |
| Role, ownership và guest            | [Roles](docs/requirements/roles-and-permissions.md), [auth transport](docs/api/auth-token-transport.md)       |
| Auth và account                     | [Auth/account endpoints](docs/api/auth-and-account-endpoints.md)                                              |
| Catalog và exact unit               | [Public catalog endpoints](docs/api/public-catalog-endpoints.md)                                              |
| Cart và wishlist                    | [Cart/wishlist endpoints](docs/api/cart-and-wishlist-endpoints.md)                                            |
| Voucher                             | [Voucher endpoints](docs/api/voucher-endpoints.md)                                                            |
| Checkout và customer order          | [Checkout/order endpoints](docs/api/checkout-and-customer-order-endpoints.md)                                 |
| Payment proof                       | [Payment proof/review](docs/api/payment-proof-and-review-endpoints.md)                                        |
| Backoffice catalog/inventory        | [Backoffice catalog/inventory](docs/api/backoffice-catalog-inventory-endpoints.md)                            |
| Fulfillment và refund               | [Backoffice order/fulfillment/refund](docs/api/backoffice-order-fulfillment-refund-endpoints.md)              |
| Warranty và after-sales             | [Warranty/after-sales](docs/api/warranty-and-aftersales-endpoints.md)                                         |
| Employee, customer, settings, audit | [System endpoints](docs/api/employee-settings-audit-endpoints.md)                                             |
| Response và error handling          | [Response contract](docs/api/response-contract.md), [error catalog](docs/api/error-catalog.md)                |
| Typed transport                     | [OpenAPI/client](docs/api/openapi-and-client.md)                                                              |
| NFR và test                         | [NFR](docs/requirements/non-functional-requirements.md), [testing strategy](docs/quality/testing-strategy.md) |

## 3. Định vị trải nghiệm

Ba nguyên tắc trung tâm:

1. **Model giúp khám phá.** Product/model card giúp khách thu hẹp dòng máy, dung lượng, màu và mức giá.
2. **Exact unit giúp quyết định.** Khách mua một `InventoryUnit` cụ thể, không mua một cấu hình chung chung.
3. **Inspection giúp tin tưởng.** Ảnh thật, pin, ngoại hình, lịch sử sửa chữa đã biết và checklist là bằng chứng trước quyết định mua.

Giao diện phải tạo cảm giác:

- Minh bạch, chính xác và bình tĩnh.
- Có chuyên môn nhưng không lạnh lùng.
- Có đủ dữ kiện nhưng không giống dashboard kỹ thuật.
- Bằng chứng xuất hiện trước quảng cáo và cross-sell.
- Mỗi bước đều cho người dùng biết chuyện gì đang xảy ra và nên làm gì tiếp theo.

Không định vị rePhone như marketplace. Một sản phẩm không có seller card, seller rating hoặc chính sách khác nhau theo người bán.

## 4. Visual direction — Soft Studio Retail + Ink Backoffice

Hướng v2.0 được tổng hợp từ sáu lựa chọn của người dùng. Đây là một hệ thống chung với mật độ khác nhau theo nhiệm vụ:

- Home/catalog giúp khách nhận diện và chọn model nhanh như một cửa hàng điện thoại Việt Nam quen thuộc.
- Model detail giúp khách hiểu model rồi quét nhanh các máy vật lý đang bán.
- Exact-unit detail giữ nhịp mua hàng quen thuộc nhưng đưa bằng chứng của đúng chiếc máy lên trước cross-sell.
- Customer portal giữ sự rõ ràng của retail; backoffice giữ mật độ vận hành cao.

Đặc trưng chung:

- Light mode duy nhất trong scope hiện tại.
- Nền trắng/xám xanh nhạt, chữ deep ink.
- Cyan/teal dùng tiết chế cho CTA, focus và dữ kiện quan trọng.
- Tạo chiều sâu bằng ảnh có ánh sáng/contact shadow, nền màu nhạt, khoảng trắng và shadow nhẹ ở các lớp cần nổi. Không làm mọi vùng thành các ô trắng phẳng giống nhau.
- Dùng cyan cho sân khấu ảnh, lavender/mint cho một số khối bổ trợ. Màu trang trí không mang nghĩa trạng thái.
- Bo media lớn 28px, card storefront 24px, panel vận hành 20px, control 12px; không tự đặt radius mới cho từng màn hình.
- Typography tự nhiên, tiêu đề sản phẩm và giá nổi bật, mô tả ngắn; không dàn trang như manifesto.
- Không vay mượn sự ồn ào của sale badge, rating, countdown hoặc banner khuyến mãi từ website tham khảo.

### 4.1 Home và catalog — Curated Bento và máy đang bán

- Header gọn, search/account/cart dễ nhận ra. Bento gồm iPhone 18, 17 và 16, ô lớn trái/hai ô phụ phải; artwork có ánh sáng và bóng tiếp xúc.
- Sau bento: thanh chọn thế hệ 18…12 và Khác → máy nổi bật → máy đang bán → các nhóm dòng máy 18…14 → trust strip/footer.
- Thẻ máy ở trang chủ xếp ảnh trên, nội dung dưới; thẻ máy ở trang dòng máy giữ bố cục ngang trên desktop. Không ép thẻ ngang vào cột nhỏ.
- Border 2px, panel/card bo lớn và shadow hai lớp theo token; không áp bóng riêng cho từng dòng bảng hoặc lặp badge trang trí.
- Banner quảng bá hai bên dẫn đến ưu đãi và cửa hàng, reflow vào nội dung trên màn hình hẹp. Không tự bịa giảm giá, bảo hành hoặc hàng sẵn có.
- Bộ lọc catalog nằm ngang, có nút đầy đủ và lựa chọn mở ngay bên dưới; không cần mở cả khung lọc trên mobile.
- `/products` mặc định xếp **Dòng mới nhất** theo đời iPhone 18 → 17 → 16… và gom các biến thể cùng dòng theo thứ tự của trang chủ. Thứ tự áp dụng trước phân trang; sắp xếp giá tăng/giảm vẫn do khách chọn.

### 4.2 Chi tiết dòng máy và chi tiết một máy

[product-model.png](docs/assets/ui/selected/product-model.png) và [product-unit.png](docs/assets/ui/selected/product-unit.png) là target tương ứng; không dùng lại hai mockup canonical v1.x.

- Model detail có banner studio ngang: tên/giá/CTA bên trái, ảnh dòng máy bên phải, sau đó một dải thông số và grid exact-unit hai cột với card nằm ngang. Model image có nhãn `Ảnh minh họa dòng máy`.
- Exact-unit detail có một hero cyan thống nhất: ảnh máy thật bên trái, tên/cấu hình/giá/giao nhận/CTA bên phải. Ba ô `Ngoại hình`, `Pin`, `Lịch sử sửa chữa` nằm **dưới hero**, không nhét lại vào purchase rail như v1.x.
- Phần dưới exact-unit có hai panel cạnh nhau: cấu hình/kết nối và kiểm tra kỹ thuật gọn; sau đó máy khác cùng dòng nếu có dữ liệu, trust strip và footer.
- Storefront còn lại kế thừa header/footer trắng gọn, canvas sáng, media bo mềm, teal action, icon outline và nhịp khoảng cách của bộ đã chọn.
- Mockup là target về presentation, không phải fixture dữ liệu. Thành phần không có authority phải được bỏ, thay bằng dữ kiện hợp lệ hoặc dùng trạng thái trống phù hợp.
- Storefront chỉ trình bày inspection summary tối đa năm hạng mục để giữ nhịp mua hàng. Checklist đầy đủ, repair note và masked identifier thuộc workflow vận hành/backoffice, không lặp lại thành dossier dài trên trang mua hàng.

- Ảnh exact unit là visual chính của trang mua hàng.
- Layout rộng nhưng có reading width rõ.
- Dữ kiện mua hàng được nhóm thành hero, tình trạng, cấu hình và inspection summary.
- Inspection summary mang cảm giác bằng chứng đáng tin, không mang thẩm mỹ terminal hoặc sci-fi.
- Mỗi page có một primary action rõ ràng.
- Trang exact unit là canonical reference cho các surface cần trình bày evidence, không phải khuôn bắt buộc cho home/catalog.

### 4.3 Backoffice

- Dùng cùng token, typography và status semantics với storefront.
- [backoffice.png](docs/assets/ui/selected/backoffice.png) giữ chuẩn shell cho cả hai vai trò; nội dung tổng quan tài chính theo phản hồi 13/10/2026 và §16.1. Sidebar deep ink, top bar trắng, main canvas sáng; đây không phải dark mode toàn ứng dụng.
- Không sao chép gallery mua hàng, purchase card, recommendation rail hoặc grid retail sang queue/detail vận hành.
- Mật độ cao hơn, ưu tiên scan, filter, queue, timeline và action.
- Desktop dùng sidebar + top bar + content fluid.
- Mục có tác vụ chờ xử lý dùng huy hiệu đỏ, số trắng ở cuối hàng; không hiện số 0. Trên 99 hiển thị `99+` nhưng tooltip/tên truy cập giữ số đầy đủ. Dùng cùng huy hiệu ở drawer mobile. Số được lấy theo quyền từ API, làm mới sau thao tác và mỗi 30 giây khi tab hiển thị; không dùng số mẫu. Quy tắc hàng chờ tại [contract tác vụ thanh bên](docs/api/backoffice-pending-tasks.md).
- Tổng quan là báo cáo tài chính theo tháng: doanh thu, doanh số, hoàn tiền, biểu đồ và bảng ngày. Admin có thêm giá vốn, lãi gộp tạm tính, vốn tồn kho và phải thu.
- Nghiệp vụ đơn hàng/thanh toán/hỗ trợ vẫn ở các route riêng qua sidebar. API thực thi quyền đọc giá vốn, không chỉ ẩn ở frontend.
- Table/list không được biến thành hàng chục card trang trí.
- Detail page ưu tiên summary, status axes, timeline, evidence và authoritative action rail.
- Mobile vẫn phải hoàn tất được critical command, nhưng màn hình staff được tối ưu trước cho `>= 1024px`.

### 4.4 Auth và đặt hàng

- Auth giữ form ở giữa, hai rìa có ảnh/mảng studio cyan và lavender. Không đặt form lên ảnh, không bọc cả trang trong card nổi, không đưa sidebar backoffice vào trang đăng nhập.
- Checkout dùng biểu mẫu liên tục ở trái và receipt nổi nhẹ ở phải. Chỉ ảnh máy trong receipt có sân khấu cyan; khoản đặt trước dùng lavender như một nhóm giải thích, không mang nghĩa cảnh báo.
- Form/auth/checkout dùng cùng control, label, button và spacing; mật độ thay đổi theo số trường, không đổi design language.

## 5. Content voice và microcopy

### 5.1 Giọng điệu

- Gọi khách hàng là **“bạn”**.
- Câu ngắn, tự nhiên, thân thiện nhưng không suồng sã.
- Dùng từ cụ thể: ảnh, pin, mã máy, tình trạng, phí, thời hạn.
- Nói thẳng giới hạn hoặc rủi ro thay vì che bằng copy marketing.
- Không dùng giọng quảng cáo khoa trương hoặc câu chữ dài, chung chung, lặp cấu trúc như nội dung do AI tạo hàng loạt.
- Không lặp uppercase eyebrow trên mọi section; chỉ dùng label nhỏ khi nó bổ sung ngữ cảnh thật.
- Không dùng số thứ tự `01`, `02`, `03` để trang trí. Chỉ đánh số khi người dùng thực sự phải làm theo một quy trình tuần tự.
- Không viết headline để giải thích điều đã rõ từ tên model, giá và trạng thái card.
- Storefront, auth và account dành cho khách phải dùng tiếng Việt tự nhiên, nhất quán. Giữ tên riêng hoặc từ đã phổ biến như `rePhone`, `iPhone`, `email`; không trộn thuật ngữ triển khai tiếng Anh vào câu tiếng Việt.
- Không giải thích transport hoặc chi tiết code cho khách bằng các từ như `access token`, `refresh session`, `cookie`, `localStorage`, `fragment`, `Bearer`, `CSRF`, tên API hay enum. Chuyển thành kết quả và hành động mà khách cần biết.
- Không hiển thị nguyên văn lỗi kỹ thuật từ provider/server trên surface khách hàng; ánh xạ theo mã lỗi hoặc dùng fallback an toàn, dễ hiểu.
- Backoffice dùng động từ nghiệp vụ chính xác, không dùng câu “thành công mỹ mãn” hoặc lời khen không cần thiết.

Ví dụ storefront:

```text
iPhone 15 Pro
Từ {giá thấp nhất hiện hành}

iPhone 15 Plus
Tạm hết máy
```

Ví dụ error:

```text
Chiếc máy này vừa không còn khả dụng.
Bạn có thể quay lại dòng iPhone 15 Pro để chọn chiếc khác.
```

Không dùng:

```text
Trải nghiệm giải pháp mua sắm tối ưu, toàn diện và đột phá.
Săn deal cực sốc ngay hôm nay!
```

### 5.2 Naming dictionary

| Khái niệm            | Label ưu tiên                              |
| -------------------- | ------------------------------------------ |
| Physical iPhone      | `Máy`, `Chiếc máy`, `Mã máy`               |
| Product/model        | `Dòng máy`, tên model                      |
| Inspection           | `Kiểm định`, `Hồ sơ kiểm định`             |
| Cosmetic grade       | `Ngoại hình A/B/C` kèm mô tả quan sát được |
| Battery health       | `Pin 91%` hoặc label theo contract         |
| Repair history       | `Lịch sử sửa chữa`                         |
| Masked identifiers   | `IMEI/Serial đã che`                       |
| Model chưa có máy    | `Tạm hết máy`                              |
| Exact unit khả dụng  | `Còn hàng`, `Không còn khả dụng`           |
| Voucher              | `Ưu đãi`, `Mã ưu đãi`                      |
| Pickup               | `Nhận tại cửa hàng`                        |
| Checkout             | `Đặt hàng`, `Xác nhận đơn`                 |
| Catalog              | `Danh mục sản phẩm`                        |
| Backoffice operation | Dùng đúng named command của API            |

Không dịch role/status/entity trong code hoặc log UI nội bộ. Giữ `CUSTOMER`, `EMPLOYEE`, `ADMIN`, `AVAILABLE`, `InventoryUnit` trong backtick khi cần nói về contract.

### 5.3 CTA dictionary

- `Xem máy này`
- `Xem hồ sơ kiểm định`
- `Thêm vào giỏ`
- `Lưu máy`
- `Tiếp tục đặt hàng`
- `Kiểm tra đơn hàng` trước khi có preview hợp lệ
- `Đặt hàng` sau khi đã xem preview hợp lệ
- `Đăng nhập để lưu` khi khách chưa đăng nhập
- `Nộp minh chứng`
- `Yêu cầu bảo hành hoặc hậu mãi`
- Backoffice dùng named action: `Bắt đầu chuẩn bị`, `Xác minh thanh toán`, `Bàn giao vận chuyển`.

### 5.4 Claim governance

- Không tạo fake urgency, sold count hoặc countdown.
- Không dùng giá gạch ngang nếu `compareAtPrice` hoặc nguồn giá không có authority rõ.
- Không hứa ETA, phí theo địa chỉ, carrier service hoặc phương thức thanh toán chưa được contract hỗ trợ.
- Không dùng review/rating, loyalty hoặc recommendation engine trong scope hiện tại.
- Không suy diễn số lượng tồn exact unit hoặc location nội bộ.
- Claim từ `StoreSettings` phải đọc runtime và có fallback an toàn.
- Không hard-code “kiểm tra kỹ thuật 20 bước”; số hạng mục và kết quả phải lấy từ `functionalChecks` hiện hành.
- Không dùng claim “đổi trả trong 15 ngày” khi contract/settings chưa cung cấp chính sách đổi trả public tương ứng.
- Không suy diễn `shipping=true` thành “giao hàng toàn quốc”; chỉ mô tả đúng fulfillment availability public.
- Không hiển thị camera, chuẩn kháng nước/IP, phiên bản hệ điều hành, kết nối hoặc thông số kỹ thuật khác chỉ vì chúng xuất hiện trong mockup. Mỗi thông số phải có field public hoặc source contract/settings rõ ràng.
- Các model fact bất biến được phép đến từ một registry frontend có nguồn khi public projection chưa đủ. Registry phải khóa theo slug, ghi URL Apple cho năm/chip/màn hình/màu, URL EveryMac/EveryiPhone cho RAM và ngày kiểm chứng; không gọi mạng khi render và không tự điền fact thiếu nguồn.

## 6. Information architecture và role navigation

`GUEST` là access mode, không phải database role. Frontend chỉ ẩn/hiện navigation để hỗ trợ UX; backend vẫn là security authority.

### 6.1 GUEST

- Home, catalog, model, exact unit và store.
- Public voucher discovery.
- Cart và checkout guest.
- Order/warranty/after-sales detail chỉ qua credential hợp lệ.
- Không có wishlist hoặc order list.

### 6.2 CUSTOMER

- Tất cả public surface.
- Account, address và security.
- Menu `Tài khoản`/mobile drawer có `Bảo hành`, `Ưa thích`, `Đơn hàng`; không nhét thêm ba mục vào hàng navigation chính làm lệch header đã chọn. Wishlist, checkout, orders, warranty và after-sales list/detail tiếp tục theo authorization backend.

### 6.3 EMPLOYEE

- Storefront vẫn đọc được như public user.
- Header có entry rõ sang backoffice.
- Backoffice operational surface theo permission contract.
- Không tải hoặc render cost/admin-only action.

### 6.4 ADMIN

- Toàn bộ employee operational surface.
- Employee/customer lifecycle, settings, audit, cost và admin-only actions.

### 6.5 Navigation shells

- `StorefrontHeader`: hai tầng trắng gọn; hàng trên wordmark/search/account/cart, hàng dưới `iPhone`, `Phụ kiện`, `Máy đang bán`, `Ưu đãi`, `Liên hệ`. Link phải tới route/query được hỗ trợ, không thêm route chỉ vì có nhãn trong ảnh.
- `AuthShell`: tối giản, không kéo navigation thương mại vào one-time-token flow.
- `CustomerShell`: storefront header + account/post-purchase navigation.
- `BackofficeShell`: sidebar deep ink theo capability, top bar trắng có `Về cửa hàng`, actor/role, `Đăng xuất`; main content sáng và contextual breadcrumb.
- Mobile navigation dùng sheet có focus trap, Escape và focus return.

## 7. Design tokens

Các giá trị v2.0 dưới đây là chuẩn hóa để triển khai nhất quán từ bộ mockup, không phải kết quả đo từng pixel của ảnh AI. `apps/web/styles/tokens.css` là nơi sở hữu executable token khi triển khai; các token mới ở đây **chưa đồng nghĩa stylesheet hiện tại đã được cập nhật**. Giữ tên semantic hiện hữu, bổ sung token còn thiếu và migrate theo concern; không hard-code lại palette/radius/shadow trong từng page.

### 7.1 Color

| Token                     |   Giá trị | Dùng cho                   |
| ------------------------- | --------: | -------------------------- |
| `--color-canvas`          | `#F7F9FB` | Nền toàn trang             |
| `--color-surface`         | `#FFFFFF` | Panel/card/form            |
| `--color-surface-subtle`  | `#F1F5F8` | Nhóm dữ liệu nhẹ           |
| `--color-brand-soft`      | `#E2F5F9` | Active pill/trust          |
| `--color-studio-cyan`     | `#EAF6FF` | Nền media/hero cyan        |
| `--color-studio-lavender` | `#F1EDFF` | Auth, repair/deposit panel |
| `--color-studio-mint`     | `#EAF8F5` | Panel pin/bổ trợ           |
| `--color-studio-warm`     | `#F3F1EF` | Ô sản phẩm phụ             |
| `--color-ink`             | `#0C1728` | Heading                    |
| `--color-body`            | `#273548` | Body text                  |
| `--color-muted`           | `#5C6A7C` | Metadata/secondary text    |
| `--color-border`          | `#CDD9E2` | Divider/border             |
| `--color-border-strong`   | `#AEBFCD` | Active/structural border   |
| `--color-primary`         | `#007C9F` | Primary action/link        |
| `--color-primary-hover`   | `#006780` | Hover/pressed              |
| `--color-on-brand-soft`   | `#006780` | Link/nhãn nhỏ trên pastel  |
| `--color-success`         | `#16875B` | Success/pass               |
| `--color-warning`         | `#9B5B00` | Warning/review             |
| `--color-danger`          | `#B4232D` | Error/destructive          |
| `--color-info`            | `#1769AA` | Informational state        |
| `--color-sidebar`         | `#0C1728` | Sidebar backoffice         |
| `--color-sidebar-text`    | `#D6E4F0` | Chữ sidebar                |
| `--color-sidebar-active`  | `#00556B` | Nền mục sidebar đang chọn  |
| `--color-on-primary`      | `#FFFFFF` | Chữ nút primary            |

Không dùng màu đơn độc để truyền status. Luôn có text và/hoặc icon.

- Trạng thái dùng token semantic hiện hữu và nền soft tương ứng: success `#E8F7F0`, warning `#FFF4DD`, danger `#FFF0F1`, info `#EDF4FF`.
- Lavender/mint/cyan dùng trang trí không được tự suy diễn thành status. Chip thanh toán/đơn hàng giữ mapping từ presenter; màu trong ảnh minh họa không override state semantics.
- Focus dùng `outline: 2px solid var(--color-primary)` và `outline-offset: 3px`; `--focus-ring` glow cũ chỉ bổ trợ. Trên sidebar tối dùng outline sáng đủ tương phản.
- Text trên nền pastel dùng ink/body/muted, không dùng chữ trắng. Primary button dùng nền primary và chữ trắng; hover/active giữ `#006780`/`#00556B`.
- Link/nhãn nhỏ trên cyan/lavender dùng on-brand-soft thay vì primary nhạt hơn; giá teal lớn vẫn dùng primary. Metadata muted v2.0 được làm đậm hơn v1.x để đọc được trên nền pastel.

### 7.2 Typography

Font stack:

```css
Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif
```

| Style         | Size/line |  Weight | Ghi chú                              |
| ------------- | --------- | ------: | ------------------------------------ |
| Product hero  | `48/56`   |     700 | Tên model/exact unit desktop         |
| Auth title    | `40/48`   |     700 | Đăng nhập/đăng ký desktop            |
| Page title    | `32/40`   |     700 | Home, checkout, backoffice; một `h1` |
| Section title | `24/32`   |     700 | Storefront `h2`                      |
| BO section    | `20/28`   |     700 | Panel/bảng backoffice                |
| Body          | `16/24`   |     400 | Nội dung chính                       |
| Body small    | `14/20`   | 400–600 | Metadata/action phụ                  |
| Label/meta    | `14/20`   | 500–600 | Khách hàng; backoffice meta `12/16`  |
| Hero price    | `40/48`   |     700 | Giá ở model/exact-unit hero          |
| Card price    | `24/32`   |     700 | Card model/unit và tổng checkout     |

Không dùng heading storefront cỡ cực lớn làm đẩy thông tin mua hàng xuống dưới fold.

Customer-facing body mặc định `16/24`, đoạn dẫn có thể `18/28`; không làm field/help text nhỏ hơn `14px`. Backoffice body/table dùng `14/20`, số liệu `32/40`, title `28–32px`. Tiêu đề hero mobile `32/40`, auth/page `28/36`, giá hero `32/40`. Dùng `clamp()` theo phạm vi này, không tăng root font-size toàn ứng dụng.

Giá, mã đơn và số đếm dùng `font-variant-numeric: tabular-nums`. Weight chỉ 400/500/600/700; không giả weight bằng text shadow. Không viết hoa toàn bộ heading; metadata nhóm sidebar có thể uppercase nhỏ và letter spacing nhẹ.

### 7.3 Spacing, sizing và grid

Spacing scale:

```text
4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80
```

- Container storefront tối đa `1440px`.
- Page gutter: `16px` mobile, `24px` tablet, `40px` desktop.
- Grid gap: `16px` mobile, `24px` desktop.
- Control mặc định `48px`, compact backoffice `44px`; icon-only hit target tối thiểu `44×44px`.
- Desktop layout dùng 12 cột; reading width không vượt khoảng `760px`.
- Backoffice dùng fluid content với max width theo page; table có min column strategy rõ.
- Section gap storefront `32–48px`, panel padding `24–32px`; mobile giảm còn `16–24px`. Backoffice section gap `20–24px`, panel padding `16–24px`.
- Auth form rộng `440–480px`; vùng chữ vẫn độc lập với ảnh hai rìa.
- Backoffice sidebar `240px` desktop; top bar `64–72px`; sidebar scroll riêng khi menu dài. Main không bị đẩy rộng hoặc mất thanh thao tác.

### 7.4 Radius, border và elevation

| Token              | Giá trị |
| ------------------ | ------: |
| `--radius-small`   |   `8px` |
| `--radius-control` |  `12px` |
| `--radius-panel`   |  `20px` |
| `--radius-card`    |  `24px` |
| `--radius-media`   |  `28px` |
| `--radius-pill`    | `999px` |

- `--border-default`: `2px solid var(--color-border)`; `--border-strong`: `2px solid var(--color-border-strong)`. Active control dùng primary, lỗi dùng danger. Divider trong bảng có thể giữ 1px.
- `--shadow-raised`: `0 2px 3px rgb(12 23 40 / 5%), 0 8px 20px rgb(12 23 40 / 7%)`.
- `--shadow-hover`: `0 4px 6px rgb(12 23 40 / 6%), 0 14px 30px rgb(12 23 40 / 12%)`.
- `--shadow-floating`: `0 12px 32px rgb(12 23 40 / 8%)`; `--shadow-overlay`: `0 20px 48px rgb(12 23 40 / 14%)`.
- Panel 20px cho backoffice/nhóm thông tin; card bán lẻ 24px; media/hero 28px. Không áp shadow cho mỗi dòng bảng, field hoặc chip.
- Generation pills và CTA xem dòng máy dùng pill; submit auth/checkout dùng control radius.

### 7.5 Motion

- Fast `120ms`, standard `180ms`, panel `240ms`.
- Easing `cubic-bezier(.2, 0, 0, 1)`.
- Hover nâng tối đa `translateY(-1px)`; ảnh zoom tối đa `1.01`.
- Không parallax, spring hoặc animation trang trí liên tục. Ngoại lệ được yêu cầu: khu máy nổi bật tự chuyển 4 giây, có dừng/điều hướng; dừng khi hover, focus, tab ẩn hoặc reduced motion.
- `prefers-reduced-motion` tắt transform/animation không thiết yếu.

### 7.6 Layering

| Layer                  | Token gợi ý |
| ---------------------- | ----------: |
| Base                   |           0 |
| Sticky content         |          20 |
| Header                 |          30 |
| Mobile purchase bar    |          40 |
| Drawer/dialog backdrop |          80 |
| Drawer/dialog          |          90 |
| Toast                  |         100 |

Không tạo `z-index` tùy ý trong page module.

## 8. Responsive system

| Range       | Tên     | Nguyên tắc                                        |
| ----------- | ------- | ------------------------------------------------- |
| `<640px`    | Mobile  | Một cột, sticky purchase, bộ lọc ngang xuống dòng |
| `640–959px` | Tablet  | 2–3 cột, summary không sticky nếu che nội dung    |
| `>=960px`   | Desktop | Hero/form hai cột nếu đủ chỗ đọc; BO sidebar      |
| `>=1280px`  | Wide    | Product grid 4 cột, dense-data rộng hơn           |

Responsive không chỉ là thu nhỏ. Thứ tự nội dung phải thay đổi theo nhiệm vụ:

- Header mobile giữ wordmark, search và cart; phần còn lại vào sheet.
- Product grid thông thường chuyển 4/3/2/1 cột.
- Home bento desktop khoảng 3:2; tablet/mobile xếp ô lớn trước, rồi hai ô phụ. Ảnh và chữ phải reflow, không co toàn bộ mockup thành ảnh nhỏ.
- Generation pills cuộn ngang trên mobile; nếu dùng shelf thì native overflow/snap và điều khiển chỉ xuất hiện khi overflow. Không dùng hover-only control.
- Model hero chuyển từ banner ngang thành tên/giá và ảnh xếp dọc; dải thông số wrap thành lưới hai cột, không làm chữ nhỏ để giữ một hàng.
- Exact-unit hero hai cột khoảng 3:2 khi đủ rộng; mobile xếp context/tên, ảnh, giá/giao nhận/CTA, tình trạng và nội dung kỹ thuật. Ba ô tình trạng thành một cột.
- Exact-unit storefront xếp fact matrix thành từng dòng dễ quét; inspection chỉ giữ summary tối đa năm kết quả, không chuyển thành dossier/accordion đầy đủ.
- Checkout summary nằm trong luồng trên mobile/tablet và có thể bám theo cột phải trên desktop khi không che nội dung hoặc focus.
- Auth mobile bỏ hoặc giảm ảnh trang trí ở rìa trước khi thu nhỏ form; form full width với gutter 16px, giữ nguyên mọi trường.
- Backoffice tổng quan xếp bộ chọn tháng → chỉ số → biểu đồ → phân tích → bảng ngày trên mobile; sidebar đổi thành drawer. Vùng bảng cuộn riêng khi cần, không làm trang tràn ngang.
- Backoffice table chuyển sang stacked row/detail disclosure khi không đủ chiều rộng; không buộc người dùng đọc bảng ngang ở 320px.
- Sticky element phải có safe-area và `scroll-padding` để không che focus/error.

## 9. Imagery và iconography

### 9.1 Phân loại ảnh

- **Exact-unit photo:** ảnh của chính máy vật lý đang bán.
- **Model/reference image:** dùng để khám phá dòng máy, không được ghi là ảnh máy thật.
- **Accessory image:** ảnh variant phụ kiện.
- **Editorial/support image:** minh họa quy trình hoặc thương hiệu, không thay bằng CSS art.
- Trong giai đoạn catalog migration, model chưa có `coverMedia` dùng fallback trung tính “Ảnh đang được cập nhật”; không sinh ảnh điện thoại giả hoặc dùng ảnh của model khác.
- Fallback hàng loạt là content debt tạm thời, không phải trạng thái phát hành production. Trước production visual sign-off, mỗi model public cần ít nhất một model/reference image đúng model và có alt text.

### 9.2 Exact-unit gallery

- Badge bắt buộc: `Ảnh thật · Mã máy {inventoryCode}`.
- Không trộn stock photo vào gallery exact unit.
- Ưu tiên các góc: trước, sau, hai cạnh, cổng/khe, camera và khuyết điểm đáng chú ý nếu có.
- Thumbnail có trạng thái chọn, keyboard navigation và accessible label.
- Gallery viewer có focus trap, Escape, nút trước/sau và focus return.
- Ảnh LCP dùng eager/priority behavior; ảnh còn lại lazy.
- Luôn khai báo width/height hoặc aspect ratio để tránh CLS.
- Ảnh lỗi trả fallback trung tính, không làm mất tên/giá/action.

### 9.3 Alt text

Mẫu:

```text
Mặt trước iPhone 15 Pro, mã máy RPH-..., màu Titan tự nhiên.
Cận cảnh vết xước nhẹ ở viền phải, mã máy RPH-...
```

Ảnh trang trí dùng alt rỗng. Không lặp cùng một alt cho mọi thumbnail.

### 9.4 Icon

- Dùng một bộ outline thống nhất từ `@phosphor-icons/react`; Server Component import qua entrypoint `/ssr`.
- Size mặc định `16`, `20`, `24`; stroke nhất quán.
- Icon nghiệp vụ quan trọng đi cùng text.
- Icon-only button bắt buộc có accessible name.
- Không emoji, text symbol, handcrafted inline SVG hoặc icon trộn nhiều phong cách.

## 10. Component contract

Mỗi shared component phải document tối thiểu:

```text
Purpose
Anatomy
Variants
States
Responsive behavior
Accessibility behavior
Do / Don't
```

Chỉ promote thành shared component khi dùng từ hai pattern trở lên hoặc bản thân có state/accessibility phức tạp.

### 10.1 Component architecture và coding policy

Frontend dùng bốn lớp rõ ràng:

```text
Route page/layout (orchestration, metadata, server fetch)
  → Feature adapter (generated DTO → presentation view model)
    → Domain component (catalog, dossier, commerce, backoffice)
      → UI primitive
```

- Route page mặc định là Server Component. Page chỉ resolve params/query, gọi typed client, xử lý boundary error và compose feature; không chứa một cây JSX nghiệp vụ dài.
- Data grouping, sorting và normalization nằm trong pure function có unit test, không nằm trong render hoặc `useEffect`.
- Domain component nhận `readonly` props hẹp theo đúng nhu cầu hiển thị. Không truyền toàn bộ response lớn xuống nhiều tầng và không import Prisma/internal entity.
- Generated DTO chỉ được chuyển thành presentation view model ở feature boundary. View model không được sao chép state machine, price rule hoặc authority của backend.
- Presentational component không tự fetch, không mutate global state và không tự suy diễn availability, minimum price hay permission.
- Chỉ leaf thật sự cần event/browser API mới có `"use client"`. Không để một icon, shelf hoặc button kéo cả catalog SSR vào client bundle.
- Ưu tiên composition và semantic domain component hơn component có nhiều boolean flag. Không tách một wrapper chỉ để giảm vài dòng JSX.
- CSS Module, test và helper riêng của component được co-locate; token dùng từ shared stylesheet, không hard-code một palette mới trong module.
- List dùng stable domain key (`id`, `slug`, `inventoryCode`), không dùng array index. Card link không được chứa nested interactive control.
- Một pattern chỉ có một implementation owner. Home không được copy markup/style của model card hoặc media fallback từ catalog.
- Context chỉ dùng cho state thật sự xuyên nhiều route/nhánh như auth hoặc commerce. State cục bộ và server-derived data không được đẩy vào global context.
- Component public API phải nhỏ, typed và có tên theo nghiệp vụ. Tránh `utils.ts`, `CommonCard`, `GenericSection` hoặc barrel export rộng làm mờ Server/Client boundary.

### 10.2 Primitives

- `Button`: primary, secondary, ghost, destructive, icon; loading không đổi width đột ngột.
- `IconButton`: 44×44px, tooltip không phải nguồn label duy nhất.
- `Link`: phân biệt inline, navigation và standalone action.
- `Input`, `Textarea`, `Select`, `Checkbox`, `RadioCard`.
- `Field`: label, hint, control, field error.
- `Price`: VND, tabular numerals, không dùng floating point.
- `Badge` và `StatusChip`: icon/text/color mapping nhất quán.
- `Divider`, `Skeleton`, `InlineAlert`, `ErrorSummary`.

### 10.3 Navigation

- `StorefrontHeader`, `MobileNavSheet`, `BackofficeSidebar`, `TopBar`.
- Storefront desktop dùng header hai tầng: hàng thương hiệu/tìm kiếm/hành động cao tối thiểu `72px`, hàng danh mục cao tối thiểu `48px`; navigation chính dùng chữ `16px`, hit target tối thiểu `44px`, căn giữa và phân bố cân bằng thay vì bám trái container.
- Mobile giữ header gọn và chuyển navigation phụ vào sheet; nhãn và accessible name dùng tiếng Việt, route hiện tại có `aria-current`.
- `SearchField`, `Breadcrumbs`, `Pagination`, `Tabs`.
- `HeaderSessionActions` và `CartBadge` là client islands.
- `StorefrontFooter` dùng chung, nền trắng và divider nhẹ; mặc định là wordmark/copyright bên trái, link điều hướng gọn bên phải như bộ đã chọn. Contact/store information mở rộng chỉ khi nhiệm vụ của page cần; không bắt mọi trang mang footer tối hoặc bốn cột lớn của v1.x.
- Nhóm dòng máy chỉ deep-link tới catalog bằng public query contract. Baseline gồm `iPhone X`, `11`, `12`, `13`, `14`, `15`, `16`, `17`; link mở cả family, không giả định một exact unit còn hàng.
- Tên, số điện thoại và địa chỉ lấy từ public store projection. Provider lỗi không được làm mất navigation footer hoặc khiến route storefront trả lỗi.
- Email và social profile là public frontend configuration, chỉ render khi hợp lệ. Social URL phải dùng HTTPS, mở tab mới với `noopener noreferrer`; không hard-code credential, private path hoặc URL chưa được xác nhận trong component. Local development được dùng profile demo đã khai báo tập trung; production thiếu config thì ẩn link thay vì dùng demo fallback.

### 10.4 Product discovery và exact unit

- `IphoneCatalogIndex`: server composition của toàn bộ generation shelf; không tự sở hữu transport.
- Home compose `FeaturedModelBento`, generation navigation, `FeaturedUnitsCarousel`, grid exact unit và các nhóm model.
- `FeaturedModelBento` hiển thị campaign iPhone 18/17/16. Model có thật dùng public media/price authority; campaign chưa có model chỉ dẫn đến tìm kiếm, không giả trạng thái còn hàng hay giá.
- `FeaturedUnitsCarousel` lấy tối đa 10 unit public đủ điều kiện, ưu tiên sao rồi giá giảm dần. Desktop 5 máy/lượt; tablet 2–3 và mobile 1. Tự chuyển 4 giây và có nút Trước/Tiếp/Tạm dừng.
- `IphoneGenerationShelf`: một `section` có heading, danh sách một hàng và progressive overflow control; không phải carousel tự chạy.
- `IphoneModelCard`: dùng chung cho home và iPhone catalog, chỉ hiển thị model image, tên và một trong hai trạng thái giá bên dưới.
  - Có authoritative `fromPrice` và model còn máy: `Từ {giá VND}`.
  - Không có exact unit sellable: `Tạm hết máy`; không hiển thị `0 đ`, `Liên hệ` hoặc một giá cũ.
  - Card vẫn link tới `/products/[slug]` ở cả hai trạng thái để người dùng đọc model và kiểm tra lại lựa chọn.
- `AccessoryProductCard` là domain component riêng; không mở rộng `IphoneModelCard` bằng chuỗi conditional không liên quan.
- `CatalogMediaFrame` sở hữu aspect ratio, model-image label, loading và fallback; home/catalog không tự dựng media markup song song.
- `groupIphoneModelsByGeneration` là pure presentation resolver dùng tên model public, không parse slug. Resolver trả generation key/label và model rank, được test cho:
  - numeric generation theo thứ tự mới → cũ;
  - base → mini/e → Plus/Air → Pro → Pro Max;
  - legacy `5/5c/5s`, `6/6s`, `X/XR/XS` và `SE`;
  - fallback `Dòng iPhone khác` thay vì làm mất hoặc làm crash một model chưa nhận diện.
- Model xuất hiện đúng một lần. Không hard-code card `iPhone 5…17` trong JSX và không tạo model giả chỉ để lấp một hàng.
- `ExactUnitCard`: ảnh thật, mã máy, grade, pin, giá, warranty, availability.
- `CatalogFilterForm`: toolbar ngang, popover giá/RAM/bộ nhớ/khóa mạng, search và hàng sort riêng; empty search rõ ràng.
- `ActualUnitGallery`, `ActualUnitBadge`, `GradeBadge`, `GradeExplainer`.
- `UnitConditionSummary`: ba ô dưới hero cho ngoại hình, pin và lịch sử sửa chữa; presenter xử lý copy, component chỉ trình bày.
- `InspectionSummary` hiển thị tối đa năm kết quả public-safe; không có CTA dẫn tới dossier dài trên storefront.
- `TrustStrip`.
- `PurchaseSummary`, `FulfillmentPanel`, `StickyMobilePurchaseBar`. Hero model và hero exact-unit là hai pattern riêng, không ép thành một component có nhiều boolean flag.

### 10.5 Commerce và customer service

- `CartItemExactUnit`, `AccessoryCartItem`, `CartSummary`.
- `VoucherCard`, `CheckoutSection`, `OrderSummary`.
- `OrderTimeline`, `PaymentPanel`, `ShipmentTracking`.
- `RefundTimeline`, `WarrantyCard`, `AfterSalesCard`, `AttachmentUploader`.
- `AvailableActionPanel` chỉ render action backend cho phép.

### 10.6 Backoffice

- `OperationalQueue`, `DataTable`, `FilterBar`, `SavedQuerySummary`.
- `DetailHeader`, `StatusAxes`, `Timeline`, `AuditMetadata`.
- `ActionRail`, `CommandForm`, `ReasonField`, `ConfirmationDialog`.
- `EvidenceViewerLauncher`, `MediaManager`, `InspectionEditor`.
- `MoneyInput` giữ chuỗi chữ số; `IdentifierReveal` giữ dữ liệu raw trong memory ngắn nhất có thể.
- `Pagination` luôn server-authoritative với allowlisted filter/sort.

### 10.7 Công thức hiển thị dùng chung

| Thành phần       | Anatomy và style chuẩn                                       | Quy tắc                                                                                       |
| ---------------- | ------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| Media stage      | Ảnh → nền studio nhẹ → badge/label có nguồn                  | Hero radius-media; ảnh không méo/cắt chi tiết chính; ảnh thật không bị chỉnh mất dấu sử dụng  |
| Model card       | Ảnh → tên → giá `Từ`/tạm hết → link                          | Radius-card, surface trắng, border nhẹ; toàn card có một đích, không nested button            |
| Exact-unit card  | Ảnh trái → mã/cấu hình → ngoại hình/pin → giá/bảo hành → CTA | Desktop card ngang, grid hai cột; mobile reflow; giữ đúng identity của máy                    |
| Condition tile   | Icon circle → tên → giá trị/mô tả                            | Cyan/mint/lavender, ba ô đồng cấp; không biến thiếu dữ liệu thành claim tốt                   |
| Form field       | Label → control → hint hoặc lỗi                              | Label ngoài field, cao 48px, radius-control; placeholder không thay label                     |
| Primary button   | Icon tùy chọn → động từ → pending                            | Nền teal/chữ trắng; hover, focus, disabled, loading rõ; không thay đổi kích thước khi pending |
| Secondary button | Label/icon, nền trắng hoặc brand-soft                        | Border mảnh, không tranh cấp với primary; destructive dùng semantic danger                    |
| Status chip      | Text + icon tùy chọn + semantic tint                         | Pill, ngắn gọn, không clickable nếu chỉ là status; mapping từ presenter                       |
| Summary/receipt  | Identity → pricing rows → tổng → giải thích → action         | Radius-panel, shadow-floating khi cần nổi; số tiền căn phải/tabular                           |
| BO data surface  | Heading/actions → filter nếu có → rows → pagination          | Radius-panel, không shadow từng row; overflow strategy rõ                                     |

Mọi component phải có default/hover/focus/disabled/pending/error khi phù hợp. Không dùng màu placeholder cho dữ liệu đã có giá trị. Đừng tạo carousel, thêm icon, badge hoặc secondary CTA chỉ để lấp khoảng trống trong mockup.

## 11. State và feedback semantics

Mọi page phải thiết kế các trạng thái sau nếu có thể xảy ra:

| State               | Cách trình bày                                                          |
| ------------------- | ----------------------------------------------------------------------- |
| Loading             | Skeleton giữ kích thước; không spinner toàn trang nếu chỉ một panel tải |
| Empty               | Giải thích vì sao trống và hành động tiếp theo                          |
| Model tạm hết máy   | Giữ card/model detail truy cập được; hiện `Tạm hết máy`, không dựng giá |
| Exact unit sold     | Nêu rõ máy không còn khả dụng và link về model                          |
| Stale price/cart    | Hiển thị giá cũ/mới và yêu cầu xem lại                                  |
| Conflict `409`      | Focus alert, refetch authoritative projection, không auto-submit        |
| Validation `422`    | Error summary + field error; giữ input an toàn                          |
| Unauthorized `401`  | Thử refresh theo transport hiện hành rồi đưa về login khi cần           |
| Forbidden `403`     | Không giả thành lỗi hệ thống; hiển thị thiếu quyền phù hợp surface      |
| Ownership not found | Dùng not-found copy, không tiết lộ resource tồn tại                     |
| Rate limit `429`    | Dùng `Retry-After`, disable/re-enable có kiểm soát                      |
| Provider `503`      | Giữ nghiệp vụ đã commit; cho retry đúng action an toàn                  |
| Replay              | Trả projection hiện hành, không hiện success side effect lặp            |

Frontend không tự suy diễn state machine, payment summary, available action, cost hoặc inventory counter.

## 12. Page patterns — storefront

### 12.1 Home

Chuẩn hình ảnh: [home.png](docs/assets/ui/selected/home.png), với nội dung và thứ tự đã chốt ngày 13/10/2026:

1. Header/search và lời dẫn ngắn.
2. Bento iPhone 18/17/16, ô lớn trái/hai ô nhỏ phải. Artwork là minh họa, không thay ảnh máy thật.
3. Thanh dòng iPhone 18, 17, 16, 15, 14, 13, 12 và nút Khác → `/products`; xuống dòng trên mobile, không bắt cuộn ngang tìm dòng.
4. Máy nổi bật: tối đa 10 máy, desktop 5 máy/lượt, tự chuyển 4 giây; nút có nhãn và pause khi hover/focus/tab ẩn/reduced motion.
5. iPhone đang bán: tối đa 24 máy có thật, nút Xem thêm máy dẫn đến catalog còn hàng.
6. Khám phá theo dòng: từ iPhone 18 đến 14; trong mỗi nhóm base/Plus/Air/Pro/Pro Max theo resolver và dữ liệu thực. Nút Thêm dòng iPhone mở `/products`.
7. Một trust strip ngắn, footer. Banner ưu đãi/cửa hàng nằm hai bên khi đủ rộng, trong luồng khi hẹp.

Data và interaction:

- Homepage dùng query public units có giới hạn; không N+1 gọi detail từng model hoặc unit. Grid dùng `ExactUnitCard` xếp dọc, link đến đúng mã máy.
- Cờ nổi bật được quản lý ở danh sách kho. Unit đủ điều kiện công khai mới được chọn: AVAILABLE, không giữ chỗ, giá/media/kiểm định hợp lệ và model/variant/location active. Sold/unavailable tự bị loại. Thiếu 10 thì bù bằng giá cao nhất; dữ liệu thiếu thì hiển thị số thực, không lặp máy.
- Cùng unit có thể có mặt trong khu nổi bật và grid đang bán; DOM id riêng theo vùng. Trong một danh sách không lặp unit.
- Danh sách dòng máy lấy dữ liệu public thật, gồm dòng tạm hết máy. Không tạo model giả để lấp nhóm 18…14. Giá Từ do API quyết định; thiếu giá sellable hiển thị Tạm hết máy.
- Chọn generation dẫn đến nhóm tương ứng; generation chưa tồn tại dẫn đến search. Khác luôn dẫn đến catalog.
- Lỗi catalog và lỗi danh sách máy có thông báo riêng; không biến fetch error thành hết hàng.
- Responsive 320/390/768/1024/1440: không tràn trang, nội dung/giá/CTA không bị cắt. Track carousel có vùng cuộn riêng; label ẩn phải nằm trong containing block của card.

### 12.2 Catalog/search

- Product card là model-level. Toolbar ngang theo thứ tự Sẵn hàng, Giá, RAM, Bộ nhớ trong, Khóa mạng, Tìm máy; xuống dòng theo chiều rộng.
- Sẵn hàng là nút bật/tắt một lần. Những nút khác mở các lựa chọn có nhãn; dùng nút đầy đủ, không trigger tam giác đơn lẻ.
- Giá dùng hai thanh range cho mức thấp nhất/cao nhất, hiển thị tiền đã chọn, Áp dụng và xóa. Không dùng hai ô nhập giá.
- RAM/bộ nhớ/khóa mạng lấy các giá trị được API hỗ trợ; chọn rồi cập nhật kết quả. Search có label và submit.
- Hàng dưới dành cho sort Mới nhất/Giá tăng dần/Giá giảm dần và xóa lọc. Mới nhất là năm ra mắt model, không được quảng bá thành máy mới nhập.
- Query nằm trong URL: back/forward/share/refresh giữ đúng lựa chọn; đổi lọc reset page. Price/storage/SIM/stock phải khớp cùng offer, không ghép từ các máy khác nhau.
- Escape/nhấn ngoài đóng popover, focus quay lại trigger. Không ẩn toolbar sau filter drawer trên mobile.
- Không client-filter một page phân trang rồi gọi đó là full catalog filter.

### 12.3 Model detail

- Target [product-model.png](docs/assets/ui/selected/product-model.png) cho `/products/[slug]`.
- Thứ tự: breadcrumb → banner studio ngang → dải thông số → danh sách máy đang có → trust strip → footer trắng.
- Banner khoảng 340–400px cao trên desktop, khoảng 40% cho tên/mô tả/giá `Từ`/CTA bên trái và 60% cho ảnh dòng máy bên phải. Không ép chiều cao này trên mobile hoặc khi copy dài.
- CTA `Xem máy đang có sẵn` cuộn tới danh sách; không thêm giỏ cho model chung. Ảnh có nhãn `Ảnh minh họa dòng máy`.
- Dải thông số cố định theo model: năm, chip, RAM, màn hình, màu; bổ sung thời lượng xem video, thời gian sạc 50%, tần số quét, độ phân giải màn hình, camera sau và camera trước. Registry `iphone-technical-specs.ts` có nguồn Apple và ngày kiểm chứng tại [nguồn specs](docs/evidence/ui-v2/iphone-specs-2026-10-13.md). Không suy công suất sạc từ công suất củ sạc; thời lượng công bố khác sức khỏe pin của máy cũ. Bỏ câu “Giá, pin và tình trạng thuộc riêng từng mã máy.”
- Danh sách có một heading `Chọn chiếc {tên dòng máy} của bạn`, mô tả ngắn và sort được hỗ trợ. Desktop grid hai cột, mỗi card ngang với ảnh bên trái và identity/tình trạng/giá/bảo hành/CTA bên phải.
- Các `availableUnits` có thể được flatten từ variants thành một grid; mỗi card phải giữ variant context như storage/color và không được xuất hiện hai lần.
- `availableUnits` có thể filter/sort local theo dữ liệu response hiện có.
- Không hiển thị sort “Mới nhất” nếu public DTO không có timestamp/field tạo ra ordering đó.
- Mỗi exact-unit row/card có CTA `Xem máy này`.
- Model tạm hết vẫn có detail page và empty state `Tạm hết máy`; không tự redirect hoặc giả thành `404`.
- Không N+1 gọi unit detail để bù field thiếu trong list.
- Gallery model dùng `product.media`; không lấy ảnh exact unit làm ảnh minh họa model nếu backend không gắn media đó ở product boundary.
- Số card phụ thuộc dữ liệu, không cố định bốn. Màu model không phải selector mua một cấu hình chung; mỗi CTA mở đúng exact unit.

### 12.4 Exact-unit detail — canonical

[product-unit.png](docs/assets/ui/selected/product-unit.png) là target cho `/products/[slug]/units/[inventoryCode]`. Hero có ảnh trái và thông tin mua phải **trên cùng một surface cyan bo 28px**; không tách thành gallery trắng và purchase card trắng rời như mockup v1.x.

Desktop:

```text
Breadcrumb
Hero cyan: ảnh thật khoảng 60% | tên/cấu hình/giá/giao nhận/CTA khoảng 40%
Ba ô đồng cấp: Ngoại hình | Pin | Lịch sử sửa chữa
Hai panel: Cấu hình và kết nối | Máy đã được kiểm tra kỹ thuật
Máy cùng dòng đang bán, nếu có dữ liệu
Trust strip và footer trắng
```

Mobile order:

1. Context/back link.
2. Tên, cấu hình và grade.
3. Gallery ảnh thật, thumbnail chỉ khi thật sự có nhiều ảnh.
4. Giá, bảo hành/giao nhận, `Thêm vào giỏ` và `Lưu máy`/`Đăng nhập để lưu`.
5. Ba ô tình trạng xếp dọc.
6. Cấu hình/kết nối và inspection summary tối đa năm hạng mục.
7. Máy cùng dòng nếu có dữ liệu, trust strip và footer.

Sticky purchase bar chỉ xuất hiện sau khi CTA gốc rời viewport và không che focus/content.

- Badge `Ảnh thật · Mã máy {inventoryCode}` vẫn bắt buộc dù mockup không thể hiện đầy đủ microcopy contract.
- Màu của exact unit là thuộc tính read-only của đúng máy đó. Không dựng nhiều swatch có vẻ selectable nếu không có navigation/data hợp lệ sang unit khác.
- Related section là tập máy khác cùng model dựa trên catalog public, không được trình bày như recommendation cá nhân hóa.
- Nếu cần bổ sung model facts hoặc related units, page có thể đọc `getPublicProduct(slug)` một lần; không gọi detail cho từng unit.
- Số kiểm định, warranty, fulfillment, giá, pin, condition và specs đều phải lấy từ public projection; các claim minh họa bị cấm ở §5.4 không được dùng để lấp khoảng trống.

#### 12.4.1 Hero và ba ô tình trạng

Mục tiêu đã xác nhận:

- Giữ ảnh thật lớn, tỷ lệ ảnh tự nhiên và vùng chữ rõ. Không dựng sân khấu/retouch ảnh thật khiến người mua hiểu sai ngoại hình; nền cyan là UI, không bằng chứng tình trạng.
- Hero bên phải theo thứ tự: grade nhỏ → tên → dung lượng/màu read-only → giá lớn teal → bảo hành/giao nhận → primary `Thêm vào giỏ` → hành động lưu → ghi chú giá/tồn khi cần.
- Không lặp ba ô tình trạng trong purchase rail hoặc sticky bar. Chúng nằm ngay dưới hero với nền cyan/mint/lavender, icon circle và mô tả ngắn.
- Không đưa checklist, số hạng mục, repair note nội bộ hoặc identifier vào các ô này. Inspection summary kỹ thuật nằm riêng phía dưới, không dùng `5/18`.

Desktop anatomy:

```text
UnitHero
├── ActualUnitGallery + ActualUnitBadge
└── PurchaseSummary + FulfillmentPanel + CommerceActions
UnitConditionSummary (ngoài hero)
├── Ngoại hình
├── Pin
└── Lịch sử sửa chữa
```

`UnitConditionSummary` mapping:

| Dòng             | Nguồn public                                                              | Quy tắc trình bày                                               |
| ---------------- | ------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Ngoại hình       | `conditionGrade`, `cosmeticNotes?`                                        | `Ngoại hình {grade}`; chỉ thêm ghi chú khi có nội dung          |
| Pin              | `batteryHealthPercent?`, `batteryCycleCount?`, `batteryReplacementStatus` | Ghép các giá trị hiện hữu; không suy đoán phần trăm hoặc chu kỳ |
| Lịch sử sửa chữa | `repairHistoryStatus`                                                     | Dùng label tổng quát; `UNKNOWN` phải thành `Chưa đủ thông tin`  |

Không render `functionalChecks`, số hạng mục, `repairNotes`, `replacedParts`, identifier hoặc dữ liệu nhân viên trong panel này. Panel là Server Component/presentational component, không thêm client state hay API call.

`NONE_KNOWN` phải là `Chưa ghi nhận sửa chữa`, không đổi thành `Chưa từng sửa chữa`. `UNKNOWN` là `Chưa đủ thông tin`. Pin/chu kỳ/original status chỉ ghép khi có giá trị; không suy ra pin nguyên bản từ phần trăm pin.

Panel `Cấu hình và kết nối` nhóm dữ kiện có nguồn:

- `Cấu hình`: năm ra mắt, chip, màn hình, RAM, dung lượng và màu sắc.
- `Thông tin riêng của máy`: mã máy, mã model, thị trường, cấu hình SIM, khóa mạng, pin/chu kỳ, tình trạng linh kiện pin, Grade, lịch sử sửa chữa và bảo hành.

Field null/blank được bỏ có chủ đích, không hiển thị `—`, placeholder hoặc claim phỏng đoán. `carrierName` chỉ hiện khi có giá trị. `cosmeticNotes` thuộc panel tình trạng và không lặp lại trong matrix. Chip, RAM, màn hình, model number hoặc region còn thiếu phải được bổ sung ở data concern có nguồn; UI không tự dựng.

#### 12.4.2 Responsive, giao nhận và bằng chứng

Quyết định presentation đã xác nhận cho hero exact-unit:

- Hero desktop khoảng `3:2` theo ảnh đã chọn; ảnh có `object-fit: contain`/crop hợp lý theo media, không bắt mọi ảnh thành 1:1. Không kéo giãn ảnh để cân hai cột.
- Ba ô tình trạng có khoảng cách và chiều cao tự nhiên tương đương; mobile/tablet reflow theo khả năng đọc, không làm chữ nhỏ để ép ba cột.
- Chỉ bật hero hai cột khi viewport đủ rộng cho purchase rail; màn hình trung bình phải trở về một cột trước khi text wrap làm cột phải dài bất thường.
- Mục tiêu cân bằng là cùng một hero có ảnh và CTA dễ nhìn, không dùng height cố định hoặc khoảng trắng giả để ép mép dưới trùng nhau.
- Chỉ hiện `Sẵn tại cửa hàng`/`Có thể giao hàng` khi projection tương ứng cho phép. Nếu đang ở kho, trình bày vị trí/giới hạn đúng dữ liệu và có thể dẫn `/store` để liên hệ; không hứa đã điều chuyển hoặc đã giữ hàng.
- UI tuyệt đối không hard-code `Có thể nhận`, tự chuyển location hoặc thay đổi checkout allocation. Khả năng pickup/shipping tiếp tục lấy trực tiếp từ public projection.

Acceptance:

- Không overflow/cắt chữ ở 320px, 390px, 768px, 1280px, 1440px và desktop rộng tương đương canonical reference.
- Giữ semantic `dl/dt/dd`, keyboard/focus behavior và SSR.
- Không phát sinh client state, API request hoặc dữ liệu public mới.

Copy cho compact inspection summary:

```text
Eyebrow: KIỂM TRA TRƯỚC KHI BÁN
Title: Máy đã được kiểm tra kỹ thuật
Body: Các kết quả tiêu biểu dưới đây được ghi nhận riêng cho máy mã {inventoryCode}.
```

Năm kết quả public-safe hiện hành được giữ nguyên. Không dùng phân số `5/18`, không mở full checklist và không biến summary thành hồ sơ vận hành.

Component boundary:

```text
UnitDossier
├── ActualUnitGallery
├── PurchaseSummary
├── UnitConditionSummary
├── UnitSpecificationGroups
├── PublicInspectionSummary
└── RelatedUnitOffers
```

Normalization nằm trong pure presenter (`buildUnitConditionSummary`, `buildUnitSpecificationGroups`) và có unit test; route/page không chứa mapping enum hoặc fallback copy. Hai panel cấu hình/kiểm tra đặt cạnh nhau desktop và xếp dọc mobile; rows trong panel là `dl/dt/dd` hoặc list semantic, không biến mỗi fact thành card.

Acceptance:

- Không phát sinh request mới, client island mới hoặc N+1; SSR và LCP gallery hiện hành được giữ.
- Kiểm tra dữ liệu đầy đủ, pin/cosmetic note/cycle bị thiếu và repair history `UNKNOWN`.
- Visual QA ở 1440px, 390px và 320px; keyboard, zoom 200% và WCAG 2.2 AA.
- Regression gallery, CTA, cart, wishlist, five-result summary và related units.
- DOM/log không chứa cost, raw identifier, internal note, repair detail, replaced parts hoặc dữ liệu nhân viên.

Quyết định v2.0 thay thế refinement A1 của v1.x: hero cyan thống nhất, ba ô tình trạng ngoài hero, hai panel cấu hình/kiểm tra bên dưới. Không đổi API; metadata/media còn thiếu là concern dữ liệu riêng, không tự tạo trong UI.

### 12.5 Store

- Dùng duy nhất public-safe store projection.
- Hiển thị rõ tên cửa hàng, điện thoại, địa chỉ và thông tin nhận máy bằng tiếng Việt tự nhiên; không lặp copy “hiện hành” hoặc dùng `pickup`, `checkout`, `catalog` trước khách.
- CTA chính là gọi cửa hàng; CTA phụ có thể mở bản đồ từ địa chỉ public đã có. Cả hai phải đủ tương phản và có trạng thái focus/hover rõ.
- Desktop nhóm thông tin liên hệ và nhận máy thành hai vùng cân bằng; mobile xếp một cột, CTA full-width và không tràn ngang.
- Không tự thêm giờ mở cửa, trạng thái đang mở hoặc dữ liệu location chưa có trong public contract.
- Thiếu store trả service-unavailable state; không tự chọn location nội bộ khác.

## 13. Page patterns — auth, account và commerce

### 13.1 Auth

Target: [auth.png](docs/assets/ui/selected/auth.png), đăng nhập trên/đăng ký dưới. Hai route dùng cùng composition, không render hai form đồng thời.

- Header tối giản: wordmark trái và `Về trang chủ` phải; footer ngắn. Không mang header thương mại/search/cart vào auth.
- Desktop form rộng 440–480px ở giữa trên nền sáng; chữ/form không đặt trong card nổi. Rìa trái có lavender/khối studio nhẹ, rìa phải có ảnh điện thoại cyan. Ảnh không che field, link hay focus.
- Above form có chuyển `Đăng nhập`/`Đăng ký` theo route, active pill brand-soft. Đây là link chuyển route với `returnTo` hợp lệ, không làm mất destination sau auth.
- Title, subtitle, fields, primary CTA và switch link giữ cùng alignment. Registration dài hơn vẫn giữ helper/CTA trong luồng, không giảm font để ép chiều cao đăng nhập.

| Route       | Field bắt buộc                                    | Field tùy chọn | Action và link                                              |
| ----------- | ------------------------------------------------- | -------------- | ----------------------------------------------------------- |
| `/login`    | Email, Mật khẩu                                   | Không          | `Đăng nhập`; `Quên mật khẩu?`; `Chưa có tài khoản? Đăng ký` |
| `/register` | Họ và tên, Email, Mật khẩu mới, Xác nhận mật khẩu | Số điện thoại  | `Tạo tài khoản`; `Đã có tài khoản? Đăng nhập`               |

- Mật khẩu có nút hiện/ẩn với accessible name. Policy giữ đúng contract: 8–128 ký tự, ít nhất một chữ và một số, không có khoảng trắng đầu/cuối. Không tự thêm yêu cầu ký tự đặc biệt hoặc strength score.
- Chỉ email/password hiện được hỗ trợ; không thêm Google/Apple/Facebook/OTP, nhớ đăng nhập, CAPTCHA hoặc checkbox điều khoản nếu chưa có flow tương ứng.
- Mobile bỏ/giảm art ở rìa, giữ form và mọi label/field/CTA. Image trang trí có alt rỗng, không giả là máy đang bán.
- Loading không đổi width CTA; validation có field error và summary focus; phản hồi login/register giữ anti-enumeration của auth contract. Đăng ký không tự biến thành đăng nhập thành công nếu backend không trả session.
- Login/register/forgot-password không phô backoffice navigation.
- Reset/invitation token đi fragment → memory → fragment được xóa trước request.
- Không query, SSR HTML hoặc localStorage token.
- Forgot/reset/invitation kế thừa palette/form/header này, nhưng bố cục chi tiết là pattern kế thừa, chưa có mockup riêng được chọn.

### 13.2 Account

- `/account`: profile và session-safe summary.
- `/account/addresses`: list/create/edit/archive, ownership theo backend.
- `/account/security`: change-password form, không hiển thị password strength claim không có policy.

### 13.3 Cart

- Exact-unit identity luôn giữ ảnh, tên và inventory code.
- Blocking warning chặn tiếp tục; price changed yêu cầu xem lại nhưng không tự sửa snapshot.
- Cart không reserve hàng; copy không được hứa “đã giữ máy”.
- Sold item có CTA về model, không gợi ý unit giả.

### 13.4 Checkout

Target: [checkout.png](docs/assets/ui/selected/checkout.png). Đây là màn hình nhập thông tin và xem lại đơn trước khi tạo đơn, không phải trang thanh toán thành công.

Desktop:

```text
StorefrontHeader
Trái khoảng 60%                         Phải khoảng 40%
Breadcrumb/progress + Hoàn tất đơn hàng Đơn hàng của bạn
Thông tin liên hệ                      Ảnh + identity đúng máy
Cách nhận hàng                         Tạm tính / giảm giá / phí
Địa chỉ giao hàng khi SHIPPING          Tổng thanh toán
Mã giảm giá + ghi chú                   Đặt trước / còn lại khi nhận
                                       Trạng thái kiểm tra + CTA
```

- Biểu mẫu trên base surface, section phân tách bằng spacing/divider; không bọc từng section trong một card. Receipt radius-panel, shadow-floating nhẹ, product stage cyan ở đầu và giải thích đặt trước lavender.
- Contact gồm họ tên, điện thoại, email. SHIPPING gồm tên/điện thoại người nhận, địa chỉ, phường/xã, quận/huyện, tỉnh/thành phố; mã bưu chính và ghi chú tùy chọn. Địa chỉ đã lưu chỉ cho tài khoản có quyền, dùng để điền đúng payload hiện hành.
- Hai radio card `Giao tận nơi` và `Nhận tại cửa hàng`; pickup không gửi shipping address. Mã giảm giá có nút áp dụng riêng, không tự hứa đã được giảm trước preview.
- Giữ ảnh, tên, cấu hình/màu, mã máy, số lượng của từng item. iPhone cố định số lượng 1; không thêm selector biến unit thành model chung.
- Receipt lấy toàn bộ pricing từ preview: subtotal, discount nếu có, shippingFee, grandTotal, depositRequired, balanceDue. Khoản đặt trước **là một phần của tổng**, không cộng lần hai. Phân biệt tổng đơn, đặt trước và còn lại bằng typography/nhóm nội dung.
- Không hard-code 22.090.000đ, 30.000đ, 500.000đ, 90 ngày hoặc tên khách trong ảnh. Giá và chính sách có thể thay đổi mà layout vẫn phải đọc được.

Các bước UI bắt buộc:

1. Giỏ hợp lệ → nhập thông tin/cách nhận → CTA `Kiểm tra đơn hàng`.
2. Preview hợp lệ → hiển thị tổng tiền có thẩm quyền và copy đã kiểm tra → CTA `Đặt hàng`.
3. Tạo đơn thành công → chuyển đúng `/orders/[orderNumber]` cùng guest transport hiện hành, rồi mới hướng dẫn đặt trước khi có yêu cầu.

Progress là chỉ dẫn hành trình, không tự thay state machine. Không hiển thị “đã đặt” trước khi create thành công.

- Khách vãng lai đặt được theo contract; không ép đăng nhập. SHIPPING có đặt trước theo cấu hình và thanh toán phần còn lại khi nhận hàng; PICKUP thanh toán tại cửa hàng theo snapshot.
- QR/chuyển khoản/tải minh chứng nằm ở trang đơn được tạo, không thêm vào checkout như một payment selector mới. Không tự dựng số tài khoản hoặc thời hạn giữ hàng trên preview.
- Preview không reserve; thay đổi giỏ, session, cách nhận hoặc voucher đã áp dụng làm preview cũ mất hiệu lực. Contact/địa chỉ/ghi chú được validate lại khi tạo đơn và snapshot theo giá trị hiện thời; chúng không tham gia pricing preview theo [API contract](docs/api/checkout-and-customer-order-endpoints.md#3-preview). Không tự thay chính sách nghiệp vụ chỉ để đổi presentation.
- `CHECKOUT_REVIEW_REQUIRED` thay summary và yêu cầu xác nhận lại.
- Không tự retry create hoặc gửi lại payment/order mutation.
- Không render payment selector, fee calculator hoặc ETA giả.
- Desktop receipt chỉ sticky nếu đủ chiều cao và không che focus. Mobile/tablet summary nằm trong flow sau các trường; CTA rõ ràng, không nhân đôi submit cạnh tranh hoặc che lỗi.

## 14. Page patterns — customer post-purchase

- Order detail lấy timeline làm trục chính.
- Payment/proof, pickup/shipping, refund và warranty là các panel theo snapshot.
- Guest token chỉ dùng đúng transport contract.
- Signed URL mở tab mới với `noopener noreferrer`, không được persist.
- `availableActions` là authority cho cancel/upload/after-sales action.
- Attachment upload có file constraints, progress, retry-safe feedback và private semantics.
- Warranty/after-sales detail luôn nói rõ bước hiện tại và bước tiếp theo.

## 15. Page patterns — backoffice catalog và inventory

### 15.1 Catalog/variant/media

- Product list → create → detail.
- Product detail chứa variant management vì backend không có standalone variant detail GET.
- Media manager parameter hóa owner type; không giả một delete rule dùng cho mọi owner.
- Publish/activate/archive là named action có confirmation và error projection.

### 15.2 Inventory

- Inventory queue có filter/pagination và link intake. Mỗi máy có nút sao đầy đủ nhãn Chọn nổi bật/Bỏ nổi bật, lưu qua API và phản ánh kết quả authoritative; không chỉ lưu local.
- Unit detail tách safe overview, inspection history, lifecycle, media, identifier và admin-only cost.
- Cost chỉ request sau khi role gate xác nhận `ADMIN`; clear khi session/role đổi.
- Lookup hỗ trợ thêm mã máy chính xác, không phân biệt hoa/thường. Lookup/reveal identifier giữ reason/audit theo contract; identifier riêng tư không vào URL, cache, log hoặc persisted state.
- Không generic status dropdown. Mỗi lifecycle dùng named command.

### 15.3 Inspection

- Editor giữ đúng bộ 18 check từ contract.
- Keyboard navigation, note conditional và completion summary rõ.
- Completed inspection read-only.
- Conflict tải lại projection thay vì merge mù.

### 15.4 Stock

- Stock level và movement là read-only projections.
- Receive/transfer/adjust/return là command form riêng.
- Không edit counter hoặc movement trực tiếp.
- Sau command, refetch level + movement ledger.

## 16. Page patterns — operational backoffice

### 16.1 Tổng quan tài chính cho nhân viên và admin

`/backoffice` và entry sidebar Tài chính. Shell theo [backoffice.png](docs/assets/ui/selected/backoffice.png); nội dung vận hành cũ được thay theo yêu cầu 13/10/2026.

- Header có tháng báo cáo theo múi giờ Việt Nam và Cập nhật. Cards nổi rõ, biểu đồ doanh thu ngày, breakdown, kênh bán và bảng ngày.
- Doanh thu lấy đơn COMPLETED có completedAt trong tháng: giá trị đơn đã trừ giảm giá, gồm phí giao; doanh thu sau hoàn trừ hoàn tiền lũy kế của nhóm đơn này. Đây không phải báo cáo dòng tiền theo ngày thanh toán.
- Doanh số hiển thị số đơn hoàn tất và số iPhone bán. Tiền dùng số nguyên VND, tránh cộng double qua nhiều order item.
- ADMIN có giá vốn đã ghi nhận, lãi gộp tạm tính, vốn tồn kho hiện tại và tiền còn phải thu. Giá vốn dựa chi phí hiện lưu; thiếu giá vốn thì không báo lãi như đã đầy đủ.
- Lãi gộp tạm tính không phải lãi ròng: chưa trừ hoa hồng, phí, thuế, chi phí vận hành và chưa tự hoàn nhập giá vốn cho hàng trả. Chú thích rõ ngay trên báo cáo.
- Vốn tồn kho/phải thu là hiện tại, không phải snapshot lịch sử của tháng. Đơn hủy không thuộc phải thu; SOLD/WRITTEN_OFF không thuộc vốn tồn kho.
- EMPLOYEE không nhận giá vốn/lãi/vốn trong response API; frontend cũng không render. Đổi tài khoản/role xóa quyền xem snapshot cũ.
- API no-store; lỗi tải không hiển thị số 0 giả. Đổi tháng giữ đúng dữ liệu tháng đã chọn; lỗi refresh cho phép thử lại.
- Sidebar giữ đủ nghiệp vụ đơn, thanh toán, kho, hậu mãi và các mục admin. Mobile reflow theo thứ tự báo cáo, table có vùng cuộn riêng.

### 16.2 Queue và detail kế thừa

- Các route inventory, order, payment, refund, warranty, after-sales dùng cùng shell/token/table/action language. Chúng chưa có mockup mới riêng; bám chức năng và anatomy dưới đây, không coi ảnh overview là mẫu chi tiết mọi module.
- Queue page: filters, sort, pagination, deadline/overdue và primary status.
- Detail page: entity summary, three-axis status nếu có, timeline, finance/evidence và action rail.
- Đơn hàng: chỉ ADMIN thấy **Giá vốn đang lưu** ở queue và tổng quan tài chính; mỗi sản phẩm có giá nhập, chi phí bổ sung và link hồ sơ máy. Ghi rõ “Theo hồ sơ máy hiện tại; có thể khác thời điểm bán.” theo lựa chọn ngày 13/10/2026. Thiếu dữ liệu hiển thị “Chưa ghi nhận/Chưa đủ dữ liệu”, không đổi thành 0; EMPLOYEE không nhận trường giá vốn từ API và không render cả snapshot cũ.
- Command form không nhận amount/status/timestamp nếu backend tự tính.
- Destructive/terminal action hiển thị entity, trạng thái hiện tại, ảnh hưởng và reason field.
- `409` luôn reload authoritative detail.
- Replay không tạo toast/email/audit giả lần hai.
- Evidence viewer không đưa signed URL/path vào audit UI hoặc log.

Áp dụng cho payment, order, pickup/shipping, refund, warranty và after-sales.

## 17. Page patterns — system administration

- Employee/customer list dùng server pagination và safe projection.
- Detail/lifecycle action theo role; frontend hide không thay thế backend guard.
- Settings form dùng version hiện hành; conflict phải refetch, không auto-merge. Cấu hình cửa hàng chứa phần bật/tắt cổng đại lý và chương trình cộng tác viên; các trang đại lý/affiliate chỉ giữ chính sách/nghiệp vụ và link đến cấu hình. Affiliate chỉ bật khi runtime và chính sách đủ dữ liệu; cập nhật enabled giữ nguyên tỷ lệ/dự phòng/lợi nhuận tối thiểu và expectedVersion.
- Bank QR upload giữ object lifecycle theo backend; UI không xóa object cũ.
- Audit list không full-text JSON; detail redacted theo serializer.
- Health page cho `ADMIN` hiển thị snapshot chẩn đoán hệ thống an toàn: API, database/migration, Storage và SMTP cùng trạng thái/thời lượng kiểm tra. `live`/`ready` public vẫn tối giản; không hiển thị URL provider, host, key, biến môi trường, lỗi SQL hoặc dữ liệu khách hàng.

## 18. Accessibility standard

Disclosure luôn là nút đầy đủ có nhãn và trạng thái Mở/Đóng; bỏ native triangle marker và nút tam giác đơn lẻ. Giữ hỗ trợ Enter/Space, focus và semantic của `details/summary` nếu dùng.

Target: **WCAG 2.2 AA**.

- Text thường contrast tối thiểu `4.5:1`; component/focus `3:1`.
- Touch target tối thiểu `44×44px`.
- Một `h1`; heading không nhảy cấp vô lý.
- Dùng landmark `header`, `nav`, `main`, `aside`, `footer` đúng nghĩa.
- Mọi form control có label thật; placeholder không thay label.
- Error summary nhận focus và link tới field lỗi.
- Success/error async dùng live region phù hợp.
- Status không truyền bằng màu đơn độc.
- Drawer/dialog trap focus, Escape và focus return.
- Tooltip không hover-only.
- Gallery, accordion, tabs và pagination dùng được bằng keyboard.
- Kiểm tra ở `320px`, zoom `200%`, reduced motion và high contrast.
- `<html lang="vi">` và nội dung/accessible name bằng tiếng Việt tự nhiên.

## 19. Performance và technical constraints

- Next.js Server Component mặc định cho đọc dữ liệu/public catalog.
- Chỉ interaction thực sự cần state/browser API mới là Client Component.
- Không chuyển page SSR thành client page chỉ để dùng một button/gallery.
- Dùng generated client, không fetch rải rác.
- Query list phải pagination/batch, không N+1.
- Home phải đọc đủ catalog public theo stable ordering trước khi resolve featured/filter/grid; không tăng `pageSize` tùy ý rồi giả định dữ liệu sẽ luôn nhỏ hơn giới hạn.
- Group/sort iPhone chạy một lần ở server hoặc pure adapter memoizable; không regroup bằng `useEffect` sau hydration.
- Generation shelf ưu tiên native CSS overflow. Chỉ thêm client control như progressive enhancement và giữ native scroll khi JavaScript lỗi.
- Public image có kích thước/aspect ratio; LCP image eager, còn lại lazy.
- Chỉ media thực sự nằm trong LCP viewport được priority; không eager toàn bộ card của mọi thế hệ.
- Loading skeleton không gây layout shift.
- Phosphor import theo icon; Server Component dùng `@phosphor-icons/react/ssr`, Client Component dùng `@phosphor-icons/react`, không bundle toàn library.
- Không thêm UI framework, Redux hoặc Storybook trong FE-0.
- CSS custom properties + CSS Modules coexist với legacy CSS; không rewrite toàn bộ `globals.css` một lần.

Representative mobile targets:

- LCP `<= 2.5s`.
- CLS `<= 0.1`.
- INP `<= 200ms`.

Đây là frontend quality budget trên seeded/test environment, không phải production SLA.

## 20. Security presentation

- Bearer access token giữ theo transport hiện hành; không localStorage.
- Refresh token/cookie không đọc bằng page code.
- Guest order/one-time auth token không vào query, analytics, log hoặc SSR HTML.
- Raw identifier chỉ tồn tại trong UI memory khi reveal thành công, có `no-store`, clear khi đóng/blur/session change.
- Cost chỉ tải và render cho `ADMIN`.
- Private bucket/path, evidence digest và signed URL không xuất hiện trong public DTO/UI log.
- Signed URL không cache; hết hạn thì yêu cầu URL mới.
- Contact/address/bank data không được đưa vào client telemetry hoặc generic error dump.
- Không truyền private data qua DOM data attribute.
- UI không thay thế role/ownership guard của backend.

## 21. Anti-patterns

- Ảnh model không ghi nhãn hoặc bị gọi là ảnh exact unit.
- Grade không có mô tả quan sát được.
- Grade bị dùng để ngụ ý máy có lỗi chức năng.
- Fake urgency, discount, sold count hoặc review.
- CTA cạnh tranh nhau cùng cấp.
- Cyan xuất hiện ở mọi card/status.
- Card bo tròn/shadow quá mức.
- Hero quảng cáo/manifesto chiếm first viewport, thay thế bento sản phẩm đã chọn hoặc đẩy phần khám phá xuống quá xa.
- Quay lại radius 10px/panel phẳng mặc định của v1.x trên mọi surface vì stylesheet cũ đang có sẵn.
- Dùng ảnh studio/model giả làm ảnh thật của một InventoryUnit hoặc chỉnh mất dấu sử dụng trên ảnh thật.
- Cắt mockup PNG thành UI, dùng PNG làm nền toàn trang, hoặc nhúng form đăng nhập/đăng ký và hai role backoffice vào cùng một page.
- Tự đổi auth centered thành split card, checkout receipt sang trái, hay sidebar backoffice thành trắng khi chưa có lựa chọn mới.
- Uppercase eyebrow và block đánh số `01–04` lặp lại chỉ để trang trí.
- Copy markup/media/price state của model card sang home thay vì tái sử dụng domain component.
- Hard-code danh sách generation/model trong JSX hoặc parse mỗi nơi một kiểu.
- Ẩn model tạm hết bằng `inStock=true`, hiển thị `Liên hệ`, `0 đ` hoặc tự dựng minimum price ở frontend.
- Icon trộn style hoặc emoji.
- Horizontal table là cách duy nhất để dùng backoffice trên mobile.
- Hover-only interaction.
- Frontend tự tính state, available action, money hoặc counter authoritative.
- N+1 unit detail từ catalog/cart.
- Auto-submit lại sau `409`.
- Generic status dropdown cho lifecycle domain.
- Raw identifier/cost/private path trong log hoặc URL.
- SEO copy chen trước dữ kiện mua hàng.

## 22. Design QA checklist

### Visual — đối chiếu ảnh đã chọn

- [ ] Mở đúng ảnh trong `docs/assets/ui/selected/` và so ở cùng viewport; không dùng mockup v1.x hoặc snapshot code cũ làm target.
- [ ] Home đúng bento lớn trái/hai ô phải; model đúng banner ngang và card unit ngang; exact-unit đúng hero cyan và ba ô tình trạng phía dưới.
- [ ] Checkout form trái/receipt phải; auth form giữa/art hai rìa; backoffice sidebar ink, nội dung tài chính theo tháng theo §16.1.
- [ ] Token được dùng, không có màu/radius/spacing tùy ý.
- [ ] Tỷ lệ khối, khoảng cách, type scale, media fit, màu nền và độ nổi được so trực tiếp với ảnh; không chỉ đánh giá “trông ổn”.
- [ ] Exact-unit photo và model image được phân biệt rõ.
- [ ] Không có claim vượt contract.
- [ ] Primary action rõ; secondary action không tranh cấp.
- [ ] Home có generation pills/grid sau bento, trust strip ngắn và footer trắng; không phục hồi generation shelves v1.x làm layout chính.

### Responsive

- [ ] 320, 390, 768, 1024 và 1440px không overflow.
- [ ] Sticky element không che content/focus.
- [ ] Matrix/table có mobile representation phù hợp.
- [ ] Safe-area được xử lý cho mobile bottom action.

### Interaction và accessibility

- [ ] Keyboard-only hoàn tất được core task.
- [ ] Focus visible và focus return đúng.
- [ ] Label, heading, landmark, live region đúng.
- [ ] Status không phụ thuộc màu.
- [ ] Zoom 200% và reduced motion dùng được.

### Data và failure

- [ ] Loading, empty, unavailable, conflict và provider error có thiết kế.
- [ ] `401/403/404/409/422/429/503` không bị gom thành “Lỗi hệ thống”.
- [ ] Mutation refetch authoritative projection khi cần.
- [ ] Không rò token, identifier, cost, private path hoặc signed URL.
- [ ] Default home có featured + phần model còn lại; mỗi model chỉ một lần trong cùng result list. Filter có chủ đích không làm mất model, fallback không tạo record giả.
- [ ] Giá `Từ` đến từ public projection; model không có giá sellable hiện `Tạm hết máy` và vẫn mở được detail.

### Quality

- [ ] Component/unit tests xanh.
- [ ] Pure adapter/grouping và card price/sold-out states có unit/component test.
- [ ] Route page giữ Server Component; Client Component chỉ là leaf có lý do rõ.
- [ ] Không có duplicated domain-card implementation hoặc unstable list key.
- [ ] Browser happy path và failure path xanh.
- [ ] Axe không có serious/critical violation.
- [ ] Visual snapshot được review ở desktop/mobile.
- [ ] Cả EMPLOYEE và ADMIN được kiểm tra: cùng shell, đúng khác biệt menu/action/dữ liệu; public/auth không rò admin control.
- [ ] Performance budget đạt hoặc có debt entry rõ.

## 23. Governance, deprecation và maintenance

### 23.1 Ownership

- Frontend/design owner duyệt thay đổi visual/component contract.
- Backend/docs owner duyệt claim nghiệp vụ hoặc thay đổi behavior.
- Security-sensitive component cần review transport/redaction.

### 23.2 Change workflow

Quy trình giữ UI không lệch:

1. Đọc `design.md` và mở ảnh route đã chọn trước khi sửa layout. Với `auth.png`/`backoffice.png`, chọn đúng nửa ảnh cần triển khai.
2. Liệt kê component/token dùng lại và state theo contract. Layout chưa có mockup riêng kế thừa surface tương ứng, không tự tạo theme/icon/card language mới.
3. Triển khai theo từng feature concern. Migrate token/primitive có kiểm soát, không đổi backend, transport hoặc workflow chỉ để giống dữ liệu minh họa.
4. Capture UI ở cùng viewport với reference, đặt cạnh ảnh và kiểm tra geometry/typography/media/spacing, rồi kiểm tra mobile và các state ngoài happy path.
5. Ghi evidence/checks trong concern triển khai; chỉ đánh dấu conformant khi checklist §22 đạt. Test xanh không thay việc so hình.

Các lựa chọn mới về palette, layout chính, shell, vị trí CTA hoặc imagery phải được phản ánh trong tài liệu và ảnh được người dùng chọn. Refinement kỹ thuật/responsive/state để thực hiện đúng chuẩn đã chốt không cần mở thêm vòng chọn lại.

Khi tiếp tục khám phá: mỗi lượt **ba ảnh**, chờ chọn rồi copy ảnh gốc vào `docs/assets/ui/selected/` theo tên màn hình, ghi SHA-256/ngày/route và cập nhật reference ở đây. Giữ file gốc; revision dùng tên có version, không âm thầm ghi đè lựa chọn.

Thay token/component phải cập nhật trong cùng concern:

- `design.md` nếu contract thay đổi.
- Executable token/component.
- Affected tests và snapshots.
- `plan-fe.md` nếu phase/status/debt thay đổi.

### 23.3 Component promotion

- Shared khi dùng ít nhất hai pattern hoặc có state/accessibility phức tạp.
- Không tạo generic `Card`/`Section` chỉ để giảm vài dòng markup.
- Domain component được ưu tiên nếu nó khóa đúng semantics.
- Reuse phải giữ semantics, không phải ép iPhone, accessory và exact unit vào một component nhiều conditional.
- Page/component vượt một trách nhiệm orchestration–presentation–interaction phải được tách theo layer §10.1 trước khi mở rộng tiếp.
- Mọi shared domain component có một owner import path; compatibility wrapper chỉ tồn tại trong migration và phải có phase xóa.

### 23.4 Deprecation

- Đánh dấu `DEPRECATED` trong docs/code comment phù hợp.
- Ghi replacement và phase xóa trong `plan-fe.md`.
- Giữ compatibility wrapper đến khi route cuối đã migrate và regression xanh.
- Không silent breaking change.

### 23.5 Design debt

Mỗi debt entry có:

```text
Route/component
Current behavior
Target pattern
Impact
Owner phase
Status
```

Không dùng design debt để hợp thức hóa security hoặc contract violation.

## 24. Decision log

Các quyết định presentation v1.x bên dưới là lịch sử. Những dòng về Retail Catalog Rows, exact-unit A1 hoặc mockup canonical cũ đã được bộ chọn ngày 12/10/2026 thay thế; quy tắc dữ liệu/security vẫn áp dụng nếu không có contract mới.

| Ngày       | Quyết định                                      | Phương án đã loại                                   | Lý do                                                                      |
| ---------- | ----------------------------------------------- | --------------------------------------------------- | -------------------------------------------------------------------------- |
| 2026-10-12 | Sáu ảnh chọn làm baseline UI v2.0               | Tiếp tục dùng mockup presentation v1.x              | Một nguồn tham chiếu cho home, model, unit, checkout, auth và backoffice   |
| 2026-10-12 | Soft Studio Retail + sidebar ink cho backoffice | Toàn bộ panel trắng phẳng hoặc theme rời từng page  | Có chiều sâu nhưng giữ mật độ đúng cho mua hàng và vận hành                |
| 2026-10-12 | Auth centered, checkout form trái/receipt phải  | Hai bản auth không đồng bộ; tự đổi luồng thanh toán | Giữ lựa chọn rõ ràng và contract nghiệp vụ hiện có                         |
| 2026-10-12 | Ba mockup mỗi vòng; lựa chọn lưu theo màn hình  | Tự triển khai ngay sau khi người dùng chọn ảnh      | Người dùng đang chốt UI trước khi yêu cầu implementation                   |
| 2026-08-25 | Technical Editorial cho exact-unit evidence     | Premium tối giản; terminal/sci-fi                   | Làm rõ lợi thế exact-unit inspection và vẫn gần gũi                        |
| 2026-08-25 | Copy gọi khách là “bạn”                         | `anh/chị`; không xưng hô                            | Tự nhiên, hiện đại, ít cảm giác máy móc                                    |
| 2026-08-25 | Wordmark chữ `rePhone`                          | Thiết kế logo mới trong phase đầu                   | Tập trung nguồn lực vào UX mua hàng                                        |
| 2026-08-25 | CSS variables + CSS Modules                     | Tailwind/Radix; tiếp tục global CSS                 | Migrate dần, ít dependency, hợp một web app                                |
| 2026-08-25 | Giữ nguyên backend trong redesign               | Mở rộng unit discovery API ngay                     | Hạn chế regression và dùng contract P0 đã ổn định                          |
| 2026-08-25 | Full 160-operation frontend coverage            | Chỉ redesign 37 route hiện có                       | Loại bỏ các nghiệp vụ còn phụ thuộc Swagger                                |
| 2026-08-25 | Exact-unit là canonical page                    | Home hoặc generic product card làm chuẩn            | Đây là khác biệt sản phẩm mạnh nhất                                        |
| 2026-08-25 | Storefront và backoffice dùng hai density mode  | Một layout/card language cho mọi surface            | Nhiệm vụ mua hàng và vận hành có mật độ khác nhau                          |
| 2026-08-25 | Không dark mode/complex animation ở P1          | Làm đầy đủ theme/motion system                      | Không phục vụ critical journey hiện tại                                    |
| 2026-08-26 | Option 1 — Retail Catalog Rows cho discovery    | Manifesto hero; editorial index; retail quá dày     | Sản phẩm xuất hiện trước, quen với người mua Việt Nam nhưng vẫn bình tĩnh  |
| 2026-08-26 | Home group model theo generation động           | Flat grid; hard-code iPhone 5–17                    | Phản ánh catalog thật, hỗ trợ model tạm hết và không tạo dữ liệu giả       |
| 2026-08-26 | Server-first + domain component composition     | Page nguyên khối; generic component nhiều cờ        | Tái sử dụng đúng semantics, giới hạn client bundle và dễ test/maintain     |
| 2026-08-26 | Hai detail mockup là canonical storefront ref   | Giữ layout detail cũ; áp retail card vào BO         | Khóa hierarchy model/exact-unit; BO chỉ kế thừa token và action hierarchy  |
| 2026-08-26 | Exact-unit chỉ giữ inspection summary gọn       | Full checklist, repair và identifier dossier        | Giảm độ dài trang mua hàng; dữ liệu vận hành vẫn do backend/backoffice giữ |
| 2026-08-27 | Compact condition rail và copy theo location    | Ép gallery cao; hard-code pickup availability       | Cân hai cột và phản ánh đúng máy đang ở cửa hàng hay kho                   |
| 2026-08-27 | Customer-first Vietnamese + balanced header     | Vá copy từng trang; header một hàng; redesign lớn   | Giữ UI dễ hiểu, cân desktop/mobile và hạn chế regression                   |
| 2026-08-27 | Source-backed model facts + role-aware links    | Mở rộng API; backfill DB; menu sao chép             | Đồng nhất 47 model không thêm request/migration và tránh navigation drift  |

Decision log này chỉ ghi quyết định presentation/interaction. Không sửa hoặc thay thế ADR nghiệp vụ.

## 25. Visual references

### 25.1 Approved internal canonical references

- [Home — Curated Bento](docs/assets/ui/selected/home.png).
- [Model — Panoramic Studio](docs/assets/ui/selected/product-model.png).
- [Exact unit — Soft Studio Purchase](docs/assets/ui/selected/product-unit.png).
- [Checkout — Soft Split Review](docs/assets/ui/selected/checkout.png).
- [Auth — Quiet Centered Access](docs/assets/ui/selected/auth.png): login trên, register dưới.
- [Backoffice — Ink Navigation and Clear Workspace](docs/assets/ui/selected/backoffice.png): employee trên, admin dưới.
- [Registry đã chọn](docs/assets/ui/selected/selections.json): provenance/hash; `design.md` là nguồn quy tắc đọc chính, registry không phải một design system song song.

Các ảnh này có authority về presentation trong phạm vi route được ghi, sau contract nghiệp vụ/security. Không suy diễn trang cart, order detail, account, inventory detail hoặc mọi admin module đã có mockup mới riêng: chúng kế thừa ngôn ngữ/token, nhiệm vụ và action contract, rồi được kiểm tra theo §22.

Mockup cũ [Retail Catalog Rows](docs/assets/ui/rephone-retail-catalog-rows-reference.png), [model v1.x](docs/assets/ui/rephone-model-detail-canonical-reference.png), [exact unit v1.x](docs/assets/ui/rephone-exact-unit-detail-canonical-reference.png), [Technical Editorial](docs/assets/ui/rephone-technical-editorial-reference.png) và các ảnh trong `fe-*` chỉ còn là lịch sử/bằng chứng implementation trước đây, không là target cho UI mới.

### 25.2 External references — non-authoritative

- [Thegioididong iPhone](https://www.thegioididong.com/dtdd-apple-iphone): generation/category scan và retail hierarchy quen thuộc.
- [CellphoneS iPhone](https://cellphones.com.vn/mobile/apple.html): product shelf, giá và navigation trong bối cảnh Việt Nam.
- [ShopDunk iPhone](https://shopdunk.com/iphone): nhịp trắng, media model và mật độ bình tĩnh.
- [Di Động Việt iPhone](https://didongviet.vn/iphone): category grouping và mobile retail cues.
- [Clickbuy iPhone](https://clickbuy.com.vn/danh-muc/iphone): product-card density và price scan.
- [Apple Certified Refurbished](https://www.apple.com/shop/refurbished/iphone): hierarchy tiết chế và quality story.
- [Back Market iPhone](https://www.backmarket.com/en-us/p/iphone-15): trust/condition gần CTA.
- [Back Market grading](https://help.backmarket.com/hc/en-us/articles/360026656634-What-condition-will-my-device-be-in): mô tả grade quan sát được.
- [Reebelo iPhone 15](https://reebelo.com/collections/apple-iphone-15): condition, battery, warranty và fulfillment hierarchy.
- [Swappa exact listing](https://swappa.com/listing/view/LZMZ35739): tư duy chọn đúng physical listing.
- [CellphoneS used iPhone](https://cellphones.com.vn/iphone-15-pro-max-256gb-cu-dep.html): sequence giá–variant–giao nhận trong bối cảnh Việt Nam.
- [FPT Shop product](https://fptshop.com.vn/dien-thoai/iphone-17-pro-max): retail purchase hierarchy và fulfillment cues.

Không sao chép logo, asset, content hoặc layout nguyên bản từ các nguồn trên.

Product facts bất biến không lấy từ các visual reference trên. Chúng dùng [Apple Technical Specifications](https://support.apple.com/kb/index?page=specs) cho thông số Apple công bố và [EveryiPhone specifications](https://everymac.com/systems/apple/iphone/index-iphone-specs.html) chỉ để bổ sung RAM Apple không công bố; URL cụ thể được lưu trên từng record registry.

## 26. Changelog

| Version | Ngày       | Thay đổi                                                                                                                                                                                          |
| ------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `2.1`   | 2026-10-13 | Chốt phản hồi: tăng border/radius/elevation; home 18/17/16, máy nổi bật và đang bán, quảng bá hai bên, toolbar lọc, specs Apple, tài chính, cấu hình đối tác, lookup mã máy và disclosure có nhãn |
| `2.0`   | 2026-10-12 | Tổng hợp sáu mockup đã chọn; khóa Soft Studio Retail/Ink Backoffice, token, page pattern và quy trình chống lệch UI; chưa triển khai application code                                             |
| `1.7`   | 2026-08-27 | Khóa source-backed facts cho 47 model, readability mode và customer navigation theo role                                                                                                          |
| `1.6`   | 2026-08-27 | Khóa tiếng Việt cho surface khách hàng, store information hierarchy và storefront header cân giữa                                                                                                 |
| `1.5`   | 2026-08-27 | Khóa hero balance responsive và fulfillment copy cho exact-unit                                                                                                                                   |
| `1.4`   | 2026-08-27 | Khóa exact-unit condition panel, grouped facts và customer-facing inspection copy                                                                                                                 |
| `1.3`   | 2026-08-26 | Rút exact-unit storefront về inspection summary; bỏ full checklist, repair và identifier dossier                                                                                                  |
| `1.2`   | 2026-08-26 | Khóa model/exact-unit mockup canonical, storefront visual language, backoffice boundary và claim guardrail                                                                                        |
| `1.1`   | 2026-08-26 | Chọn Retail Catalog Rows cho home/catalog; khóa generation shelf, sold-out state và component architecture                                                                                        |
| `1.0`   | 2026-08-25 | Khóa Technical Editorial, full web scope, tokens, patterns, accessibility, security và governance                                                                                                 |
