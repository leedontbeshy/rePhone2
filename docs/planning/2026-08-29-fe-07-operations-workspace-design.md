# FE-07 Operations Workspace Design

**Ngày khóa thiết kế:** 29/08/2026  
**Nhánh triển khai:** `feat/fe-7-operations`  
**Mockup đã duyệt:** [order-detail-selected.png](../assets/ui/fe-07/order-detail-selected.png)

## 1. Understanding summary

- FE-07 chuẩn hóa 11 route vận hành hiện có cho đơn hàng, giao nhận, thanh toán,
  hoàn tiền, bảo hành, chính sách bảo hành và hỗ trợ sau mua.
- Người dùng chính là `EMPLOYEE` và `ADMIN`; khách hoặc tài khoản không đủ quyền
  phải bị chặn trước khi nội dung vận hành được render.
- Danh sách phải ưu tiên quét nhanh, lọc/phân trang theo dữ liệu máy chủ và không
  làm trắng hoặc tải lại toàn bộ trang khi thay đổi bộ lọc.
- Trang chi tiết dùng chung hierarchy: định danh, trạng thái nghiệp vụ, nội dung hồ
  sơ, timeline/minh chứng và rail `Xử lý đơn hàng` hoặc action rail tương đương.
- Chỉ render thao tác do projection `availableActions` cho phép. UI không tự suy
  diễn trạng thái hoặc quyết định nghiệp vụ từ nhãn đang hiển thị.
- Giao diện kế thừa shell, token, typography và mật độ FE-05/FE-06; nội dung hiển
  thị dùng tiếng Việt tự nhiên và tránh thuật ngữ triển khai.
- FE-07 không thay đổi transaction, state machine, payment gateway, hãng vận
  chuyển hoặc mô hình dữ liệu nghiệp vụ.

## 2. Scope

### 2.1 Routes

1. `/backoffice/orders`
2. `/backoffice/orders/[id]`
3. `/backoffice/payments`
4. `/backoffice/payments/[id]`
5. `/backoffice/refunds`
6. `/backoffice/refunds/[id]`
7. `/backoffice/after-sales`
8. `/backoffice/after-sales/[id]`
9. `/backoffice/warranties`
10. `/backoffice/warranties/[id]`
11. `/backoffice/warranty-policies`

Phạm vi API giữ theo `plan-fe.md`: Orders 11, Shipments 4, Payments 5, Refunds 8,
tạo refund từ order 1, After-sales 14 và Warranty/Policy 10 — tổng 53 operations.

### 2.2 Explicit non-goals

- Không thêm generic status editor hoặc lệnh “đổi trạng thái”.
- Không tích hợp carrier, payment gateway, giao lại lần hai hoặc tự động hủy quá
  hạn từ frontend.
- Không thêm repair task, kỹ thuật viên, linh kiện hoặc chi phí sửa chữa.
- Không tạo/xóa/khôi phục warranty thủ công và không hard-delete policy.
- Không hiển thị raw UUID, storage path, giá vốn, raw IMEI hoặc dữ liệu nội bộ
  ngoài projection cho phép.

## 3. Assumptions and non-functional requirements

### 3.1 Performance and scale

- Queue có thể đạt hàng nghìn bản ghi; tìm kiếm, lọc, sắp xếp và phân trang chạy
  qua API, dùng query đã allowlist và giữ kết quả hiện tại trong lúc cập nhật.
- Không thực hiện N+1 lookup để bổ sung ảnh hoặc thông tin catalog không có trong
  projection.
- Detail refetch sau command chỉ cập nhật đúng hồ sơ đang mở; không reload document.

### 3.2 Security and privacy

- Root backoffice gate không render route child trước khi xác định vai trò.
- Action admin-only vẫn được kiểm tra ở cả UI và API; việc ẩn nút không thay thế
  authorization phía máy chủ.
- Signed URL của minh chứng không được lưu bền; mỗi lần mở phải xin URL mới và xử
  lý riêng loading, hết hạn, không khả dụng và lỗi nhà cung cấp.

### 3.3 Reliability

- `409` và replay phải refetch projection chính thức, không tự sửa state phía client.
- Command pending khóa double-submit; focus quay lại trigger sau dialog/drawer.
- Terminal record là read-only. Action nguy hiểm phải nêu rõ đối tượng, trạng thái
  hiện tại, ảnh hưởng và lý do/xác nhận.

### 3.4 Responsive and accessibility

- Desktop-first từ `>= 1024px`; sidebar giữ geometry FE-06.
- Dưới `960px`, navigation chuyển sang dạng ngang cuộn; dưới `768px`, table chuyển
  thành row-card thay vì ép cuộn ngang.
- Critical command vẫn hoàn tất được ở `320px` và `390px`.
- Control cao tối thiểu 44px; trạng thái luôn có chữ hoặc icon, không dựa vào màu;
  focus ring, live status và error summary phải rõ.

### 3.5 Maintenance

- Route page chỉ orchestration. Adapter chuyển DTO thành presentation model.
- Shared primitives sở hữu navigation, queue, filter, detail header, status axes,
  timeline, money summary, evidence viewer, action rail và dialog.
- Mỗi nhóm nghiệp vụ có presenter/logic test riêng; không để page nguyên khối tiếp
  tục phình lớn.

## 4. Final visual design

### 4.1 Shared shell

- Sidebar trắng 272px, topbar trắng 76px, canvas `#F7F9FB`, desktop padding 48px.
- Inter; page title 32/40, section title 20/28, body 16/24, metadata 14/20.
- Primary `#007C9F`, active soft `#E2F5F9`, border `#DCE4EA`.
- Panel radius 10px, control radius 8px, border mảnh, không shadow trang trí.
- Navigation chia nhóm có nhãn: bán hàng/tài chính, sau mua và các module hiện có.

### 4.2 Queue pattern

- Page header gọn, không dùng metric dashboard giả.
- Filter bar có search, filter nghiệp vụ, sort và result summary.
- Desktop dùng dense row/table; status và hạn xử lý nằm trên trục quét chính.
- Mobile dùng stacked row-card với cùng thông tin và một CTA `Xem chi tiết`.
- Thay filter giữ list cũ và báo `Đang cập nhật`, không làm trắng toàn trang.

### 4.3 Detail pattern

- Header hiển thị user-facing number, chủ thể, thời điểm và link quay lại.
- Order detail có ba trục bằng nhau: `Đơn hàng`, `Giao nhận`, `Thanh toán`.
- Layout desktop 8/4. Cột chính chứa cảnh báo hiện tại, sản phẩm, khách/giao nhận,
  timeline và tài chính. Rail phải dùng heading `Xử lý đơn hàng`.
- Rail chỉ có một primary command tại một thời điểm và tối đa hai supporting action.
- Payment/refund detail tái dùng pattern nhưng dành không gian chính cho evidence.
- After-sales detail dùng timeline/hành trình rõ hơn, nhưng action rail và token giữ
  cùng ngôn ngữ với order detail.

### 4.4 Copy

- Dùng động từ nghiệp vụ: `Xác nhận đơn hàng`, `Bắt đầu chuẩn bị`, `Bàn giao vận
  chuyển`, `Xác minh thanh toán`, `Bắt đầu hoàn tiền`, `Tiếp nhận yêu cầu`.
- Không hiển thị `backend`, `API`, `UUID`, `token`, `transaction`, enum hoặc raw
  status code trong UI.
- Heading rail đã duyệt là `Xử lý đơn hàng`, thay cho `Việc cần làm tiếp`.

## 5. Data and interaction flow

```text
Route page
  -> API client
    -> feature presenter / safe projection
      -> queue hoặc detail view
        -> action rail đọc availableActions
          -> dialog/drawer xác nhận
            -> command API
              -> refetch authoritative projection
```

- Filter state được allowlist trong URL để back/forward và deep link hoạt động.
- Form action giữ dirty state khi lỗi validation; lỗi theo trường và error summary
  cùng trỏ về đúng field.
- Sau success, view refetch rồi cập nhật status axes, money summary và timeline.
- Khi conflict/replay, view refetch và dùng thông báo trung tính; không phát email,
  audit hoặc success toast lần hai từ frontend.

## 6. Route-specific adaptations

| Nhóm | Queue focus | Detail focus | Primary supporting primitive |
| --- | --- | --- | --- |
| Orders/shipments | trạng thái ba trục, hạn giữ máy | sản phẩm, khách, giao nhận, tiền, timeline | `StatusAxes`, `ActionRail` |
| Payments | chờ kiểm tra, quá hạn | minh chứng, số tiền, đơn liên quan | `EvidenceViewer` |
| Refunds | chờ xử lý, người nhận xử lý | phương thức, số tiền, minh chứng, timeline | `MoneySummary` |
| After-sales | loại yêu cầu, giai đoạn, cập nhật gần nhất | nhận máy, kiểm định, quyết định, resolution | `JourneyTimeline` |
| Warranties | hiệu lực tính theo thời gian | sản phẩm, owner, thời hạn, void reason | `DetailHeader` |
| Warranty policies | active/draft/archived | phạm vi, thời hạn, version và admin command | `PolicyEditor` |

## 7. Error and edge states

- Loading ban đầu dùng skeleton ổn định chiều cao; không ló legacy UI.
- Empty queue có lý do và nút xóa filter nếu đang lọc.
- Permission/404 dùng safe state, không lộ sự tồn tại của hồ sơ ngoài quyền.
- Evidence expired/unavailable có nút xin lại link; không tái sử dụng URL cũ.
- Terminal/replay loại bỏ action rail command và giữ timeline read-only.
- Money hiển thị từ server: tổng, đã thu, đã hoàn, còn thu, còn có thể hoàn; frontend
  không tự tính quyền hoàn tiền.

## 8. Testing strategy

- Presenter/logic unit tests cho label, status axes, available action, money và
  lifecycle projection.
- Component tests cho loading/empty/error, dialog focus, pending lock, validation,
  evidence failure và terminal read-only.
- Browser tests cho queue filter không reload, order command, payment evidence,
  refund flow, warranty admin-only và after-sales resolution.
- Viewport QA tại 1440, 1024, 768, 390 và 320px; không overflow và không che focus.
- Design QA so mockup đã duyệt với route thật cùng viewport/state; phải đạt
  `final result: passed` trước handoff.

## 9. Decision log

| Quyết định | Phương án đã cân nhắc | Lý do |
| --- | --- | --- |
| Dùng layout `next action` 8/4 làm chuẩn | split-view queue, journey-first dossier | Dễ quét, tái dùng cho nhiều detail route, rủi ro thấp hơn |
| Rail mang tên `Xử lý đơn hàng` | `Việc cần làm tiếp`, `Bước tiếp theo`, `Tác vụ hiện tại` | Chuyên nghiệp, rõ nghiệp vụ và bao quát thao tác phụ |
| Giữ riêng ba trục order/fulfillment/payment | một progress chung | State machine độc lập; gộp sẽ tạo tiến độ giả |
| Queue desktop dày, mobile row-card | card grid ở mọi viewport, table ngang | Phù hợp vận hành và vẫn dùng được ở 320/390px |
| Chỉ render `availableActions` | map action từ status phía client | Giữ API authoritative và tránh lệnh sai trạng thái |
| Dùng shared primitives nhưng adapter riêng theo feature | một component khổng lồ hoặc copy từng route | Giảm trùng lặp mà không xóa khác biệt nghiệp vụ |
| Không bổ sung ảnh qua catalog lookup | N+1 catalog lookup hoặc ảnh placeholder | DTO không bảo đảm media; tránh chi phí và claim sai |

## 10. Implementation slices

1. Shared operations shell/navigation/primitives.
2. Orders queue/detail and shipment commands.
3. Payments queue/detail and evidence review.
4. Refunds queue/detail and completion evidence.
5. Warranties and warranty policies.
6. After-sales queue/detail and five resolutions.
7. Browser scenarios, responsive/design QA and documentation closure.
