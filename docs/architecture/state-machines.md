# State machines

Tài liệu này là nguồn transition/guard hiện hành của P0. Controller không nhận yêu cầu “set status” tổng quát; mỗi transition phải là một use case có tên và guard rõ.

## 1. Order

```text
PLACED → CONFIRMED → PROCESSING → COMPLETED
   └───────────────→ CANCELLED
```

- PLACED cần order items và reservation tạo thành công.
- Shipping confirm cần deposit verified; pickup confirm cần staff accept.
- PROCESSING bắt đầu khi chuẩn bị hàng.
- COMPLETED cần fulfillment COMPLETED và payment summary PAID.
- Không cancel khi fulfillment IN_TRANSIT.
- PLACED/CONFIRMED/PROCESSING có thể → CANCELLED khi fulfillment chưa handover; PROCESSING sau RETURNED cũng có thể cancel.
- Cancel cần reason; COMPLETED/CANCELLED là terminal.
- Customer/guest không tự cancel khi deposit proof `UNDER_REVIEW`; staff phải reject hoặc verify trước.
- Cancel khi đã có verified payment tạo Refund `REQUESTED` cho số còn phải hoàn trong cùng transaction; không chờ refund completed để release inventory.

## 2. Fulfillment

Pickup:

```text
PENDING → PREPARING → READY → COMPLETED
     └──────────────→ CANCELLED
```

Shipping:

```text
PENDING → PREPARING → IN_TRANSIT → COMPLETED
                          └──────→ FAILED → RETURNED
                                               └→ CANCELLED
```

- P0 không redelivery sau RETURNED; staff kiểm tra hàng rồi cancel/refund. Shipment attempt sau thuộc P1.
- Pickup completed consume reservation và xuất tồn.
- Pickup fulfillment PENDING/PREPARING/READY có thể → CANCELLED qua owning Order cancellation command.
- Carrier handover consume reservation đúng một lần; unit chuyển IN_TRANSIT.
- Delivered chuyển unit SOLD.
- Returned unit chuyển INSPECTING; accessory chưa tự nhập lại tồn bán được.
- Complete pickup có thể create+verify CASH payment cho balance; shipping delivered có thể create+verify COD payment cho balance trong cùng transaction.
- Fulfillment completion luôn yêu cầu payment summary PAID. P0 đạt trạng thái này bằng CASH khi pickup hoặc COD khi shipping; không tạo bank-transfer balance attempt. Nếu balance bằng 0 thì không tạo Payment.
- Shipping fulfillment PENDING/PREPARING có thể → CANCELLED trước handover; RETURNED chỉ → CANCELLED sau khi hàng đã về và được ghi nhận.
- Voucher consume và Warranty phát hành khi Order completed.

## 3. Shipment attempt

```text
CREATED → HANDED_TO_CARRIER → DELIVERED
    │               └──────→ FAILED → RETURNED
    └→ CANCELLED
```

P0 unique `orderId`, đồng thời unique `(orderId, attemptNumber)` và `attemptNumber=1`. Nếu P1 bỏ giới hạn một attempt, attempt mới vẫn không được consume tồn lần thứ hai.

## 4. Payment

Bank transfer attempt:

```text
AWAITING_PROOF → UNDER_REVIEW → VERIFIED
       │              └──────→ REJECTED
       ├─────────────────────→ EXPIRED
       └─────────────────────→ CANCELLED
```

- Rejected attempt không sửa lại. Payment không phải shipping deposit có thể tạo attempt mới nếu use case còn cho phép; shipping deposit bị reject thì cancel order theo quy tắc bên dưới.
- Cash/COD được tạo và verified atomically bởi staff.
- Review dùng conditional update; terminal attempt immutable.
- Received amount khác expected amount cần note.
- Shipping deposit có 30 phút để submit proof. Submit đúng hạn chuyển reservation sang `REVIEW` không expiry; 24 giờ là SLA review, không phải auto-cancel deadline.
- Deposit hết hạn chưa có proof hoặc bị reject làm cancel order/fulfillment và release reservation/voucher trong cùng transaction.
- Verify shipping deposit hợp lệ đồng thời chuyển Payment sang `VERIFIED`, cập nhật payment projection, chuyển Order `PLACED → CONFIRMED` và reservation sang `FULFILLMENT`.
- Shipping deposit chỉ verify khi `receivedAmount >= depositRequired`; amount khác expected cần note.

Order payment summary:

- Grand total bằng 0: PAID dù không có Payment row.
- Grand total lớn hơn 0 và không có verified payment: UNPAID.
- Đã thu nhỏ hơn grand total: PARTIALLY_PAID.
- Đã thu đủ/lớn hơn grand total: PAID.
- Completed refund nhỏ hơn tổng đã thu: PARTIALLY_REFUNDED.
- Completed refund bằng tổng đã thu: REFUNDED.

## 5. Refund

```text
REQUESTED → PROCESSING → COMPLETED
     ├───────────────→ REJECTED
     └───────────────→ CANCELLED
```

- Amount dương; tổng completed refund không vượt verified payment.
- Tổng Refund `REQUESTED/PROCESSING/COMPLETED` không được tạo nghĩa vụ vượt verified payment chưa được hoàn.
- Bank refund cần evidence trước completed.
- Terminal refund immutable; sửa sai bằng record mới và audit.
- Supabase evidence được upload/kiểm tra trước database transaction; completion transaction chỉ lưu metadata và cập nhật Order projection.

## 6. InventoryUnit

```text
RECEIVED → INSPECTING → AVAILABLE
                 ├────→ REPAIRING → INSPECTING
                 ├────→ QUARANTINED → INSPECTING
                 └────→ WRITTEN_OFF

AVAILABLE → IN_TRANSIT → SOLD
AVAILABLE ─────────────→ SOLD
AVAILABLE ─────────────→ INSPECTING  (reinspection, không active reservation)
RECEIVED/INSPECTING/AVAILABLE/REPAIRING/QUARANTINED ─→ WRITTEN_OFF
QUARANTINED ─→ REPAIRING
REPAIRING ───→ QUARANTINED
RECEIVED ────→ QUARANTINED
IN_TRANSIT/SOLD ───────→ INSPECTING
INSPECTING ────────────→ SOLD  (trả lại thiết bị cho khách trong after-sales)
```

- AVAILABLE cần current inspection đạt, giá/identifier hợp lệ và không có active reservation.
- Staff có thể rút unit AVAILABLE khỏi bán bằng cách tạo PRE_SALE inspection; command yêu cầu không active reservation và atomically chuyển AVAILABLE→INSPECTING.
- Failed shipping vẫn IN_TRANSIT tới khi hàng thực nhận về.
- WRITTEN_OFF terminal và chỉ cho unit không có active reservation; return/after-sales cung cấp context cho SOLD → INSPECTING.
- INSPECTING → SOLD chỉ khi thiết bị được trả lại cho khách: case bị REJECTED sau kiểm định hoặc resolution REPAIRED/RETURNED_UNCHANGED; không tạo sale/movement mới.

## 7. Inspection, Reservation và VoucherUsage

```text
Inspection: DRAFT → COMPLETED
Reservation: ACTIVE → RELEASED | EXPIRED | CONSUMED
VoucherUsage: RESERVED → CONSUMED | RELEASED
```

- Completed inspection immutable; đổi current inspection trong một transaction.
- Reservation terminal command idempotent; quantity counter cập nhật atomic.
- Gia hạn active reservation cần reason/audit.
- Voucher reserve cùng tạo order, release cùng cancel/expire, consume khi complete.
- Reservation shipping chờ proof có `expiresAt`; khi proof sang `UNDER_REVIEW`, `expiresAt` được bỏ và `holdReason` chuyển `REVIEW`.

## 8. Warranty

```text
ACTIVE → VOIDED
```

- Expiry được tính động: `now >= endAt`; không lưu EXPIRED.
- Warranty valid khi ACTIVE và `startAt <= now < endAt`.
- Void chỉ admin, cần reason/audit.

## 9. After-sales

```text
REQUESTED → RECEIVED → INSPECTING
                         ├→ APPROVED → RESOLVED
                         └→ REJECTED
REQUESTED → CANCELLED
```

- Warranty request cần warranty valid; P0 không có override warranty hết hạn/void.
- APPROVED cần inspection context.
- REPLACED cần unit khác và allocation; REFUNDED cần completed refund.
- RESOLVED, REJECTED, CANCELLED terminal.

## 10. User account

```text
Customer: ACTIVE ↔ SUSPENDED
Employee: PENDING_VERIFICATION → ACTIVE
          PENDING_VERIFICATION/ACTIVE → DISABLED
          DISABLED → ACTIVE | PENDING_VERIFICATION
Admin: ACTIVE
```

- Customer register tạo ACTIVE ngay; suspend/activate chỉ Admin, revoke session/token và không cancel Order/AfterSales lịch sử.
- Employee accept invitation chuyển PENDING_VERIFICATION → ACTIVE. Enable từ DISABLED về ACTIVE khi đã có password, nếu chưa có password thì về PENDING_VERIFICATION và phát invitation mới.
- P0 không suspend employee, disable customer, quản lý Admin account hoặc đổi role qua API.
- Chỉ User ACTIVE vượt auth guard; transition khóa tài khoản có hiệu lực với access request kế tiếp.

## 11. Quy tắc chung

- Command lặp lại với cùng idempotency context không tạo side effect lặp.
- Invalid transition trả domain conflict, không sửa một phần dữ liệu.
- Transition quan trọng ghi AuditLog với actor, request ID và reason nếu cần.
- State machine P0 đã bao phủ account, order, payment, refund, fulfillment, inventory, inspection, reservation, voucher, warranty và after-sales.

## 12. Dealer channel — Spec v1.0

Phần 1–11 giữ nguyên baseline STOREFRONT. Bảng sau là nguồn transition cho kênh DEALER, theo [business spec](../requirements/dealer-channel.md) và [invariant registry](../quality/dealer-invariants.md). Các transition đã được nối với controllers, ledger, migration và worker trên `codex/dealer-portal`; tên command trong bảng là nghiệp vụ, đường dẫn HTTP thực tế xem [contract](../api/dealer-channel-contract.md).

Mọi command ghi AuditLog cùng transaction; cột A = audit bắt buộc. E = outbox sự kiện safe DTO cùng commit. Dealer = credential hợp lệ, đủ scope/ownership; Staff = quyền nghiệp vụ phù hợp; Admin = admin re-auth cho thao tác nhạy cảm. System = job/service đã có ngữ cảnh server. Guard thất bại rollback toàn bộ và trả domain conflict. Replay cùng idempotency không tạo thêm audit/business event. Enum chung reuse Prisma baseline; không thêm PAUSED vào ReservationStatus hoặc RESERVED vào InventoryLifecycleStatus.

| ID / Đối tượng | Từ | Command | Guard | Đến | Tác động trong transaction | Actor | Audit/event |
|---|---|---|---|---|---|---|---|
| DLR-01 / Dealer | chưa có | applyDealer | Tài khoản active, hồ sơ hợp lệ, không profile trùng; xác nhận email ngân hàng trước khi duyệt ACTIVE | PENDING/NORMAL | Tạo profile và contract acceptance version | Chủ tài khoản | A |
| DLR-02 / Dealer | PENDING | approveDealer | Hồ sơ LIVE đủ điều kiện, contract và tài khoản hoàn đã xác minh | ACTIVE / security giữ nguyên | Approval history, approvedAt/By | Admin | A |
| DLR-03 / Dealer | PENDING | rejectDealer | Lý do bắt buộc | REJECTED / security giữ nguyên | Approval history | Admin | A |
| DLR-04 / Dealer | REJECTED | resubmitDealer | Bổ sung hồ sơ; không đổi chủ | PENDING / security giữ nguyên | Snapshot revision/acceptance | Chủ tài khoản | A |
| DLR-05 / Dealer | ACTIVE | suspendDealerBusiness | Lý do bắt buộc | BUSINESS_SUSPENDED / security giữ nguyên | Chặn đơn/key mới; giữ nghĩa vụ cũ | Admin | A |
| DLR-06 / Dealer | BUSINESS_SUSPENDED | resumeDealerBusiness | Đủ điều kiện hiện hành, lý do | ACTIVE / security giữ nguyên | History; không tự mở khóa security | Admin | A |
| DLR-07 / Dealer | ACTIVE/BUSINESS_SUSPENDED | closeDealerBusiness | Lý do, chuyển nghĩa vụ đang mở cho vận hành | CLOSED / security giữ nguyên | Chặn sale mới; bảo hành/đơn cũ vẫn xử lý | Admin | A |
| DLR-08 / Dealer | bất kỳ/NORMAL | lockDealerSecurity | Có thẩm quyền, lý do | business giữ nguyên/SECURITY_LOCKED | Revoke sessions/keys, pause deliveries, giữ orders | Admin | A |
| DLR-09 / Dealer | bất kỳ/SECURITY_LOCKED | unlockDealerSecurity | Xác minh khôi phục, lý do | business giữ nguyên/NORMAL | Không phục hồi raw keys đã revoke; cấp mới riêng | Admin | A |
| ORD-01 / Order | chưa có | createDealerOrder | Approved, unlocked, quota, exact unit available, preview còn khớp, shipping quote hợp lệ | PLACED | Snapshot + item + reservation + FULL_PAYMENT request + idem + outbox | Dealer | A/E |
| ORD-02 / Order | PLACED | allocateVerifiedDealerReceipt | Nguồn đã xác minh cùng dealer, funding đủ total, order vẫn active | CONFIRMED | Allocation, request SATISFIED, reservation FULFILLMENT, projection | Staff | A/E |
| ORD-03 / Order | PLACED | allocateVerifiedDealerReceipt | Nguồn hợp lệ, funding vẫn thiếu, deadline chưa từng mở hoặc giữ nguyên deadline cũ | PLACED hoặc CANCELLED nếu hết hạn sau review | Allocation; FULL superseded/BALANCE request; nếu hết hạn hủy+refund sources | Staff | A/E |
| ORD-04 / Order | CONFIRMED | prepareDealerShipment | Funding đủ, đúng unit/location | PROCESSING | Fulfillment PREPARING, shipment CREATED | Staff | A/E |
| ORD-05 / Order | PROCESSING | confirmDealerDelivery | Shipment HANDED_TO_CARRIER, funding hợp lệ, delivery evidence theo baseline | COMPLETED | Fulfillment COMPLETED, unit SOLD, warranty; không COD | Staff | A/E |
| ORD-06 / Order | PLACED/CONFIRMED/PROCESSING | cancelDealerOrder | Chưa handover hoặc đã returned; review cần admin override | CANCELLED | Close requests, release active hold, refund nghĩa vụ eligible; không xóa receipt/proof | Dealer/Staff/Admin theo guard | A/E |
| ORD-07 / Order | PLACED | expireDealerOrder | Dưới lock: thiếu tiền, deadline due, không review | CANCELLED | Close requests, reservation EXPIRED, refund phần thực nhận hợp lệ | System | A/E |
| RSV-01 / Reservation | chưa có | reserveDealerUnit | Order/item hợp lệ, không ACTIVE khác | ACTIVE / DEALER_PAYMENT | Tạo expiresAt theo submission clock | System trong ORD-01 | A/E qua order/catalog |
| RSV-02 / Reservation | ACTIVE / DEALER_PAYMENT hoặc DEALER_BALANCE | beginProofReview | Proof đúng hạn, chưa review khác | ACTIVE / REVIEW | Lưu origin/remaining/deadline, expiresAt null, reviewStartedAt | System trong proof submit | A/E qua order |
| RSV-03 / Reservation | ACTIVE / REVIEW | finishProofReview | Proof terminal, order còn active | ACTIVE hoặc EXPIRED | Reject submission: restore remaining; shortage: giữ absolute balance; đủ tiền: FULFILLMENT | System trong review | A/E qua order/catalog |
| RSV-04 / Reservation | ACTIVE | consumeDealerReservation | Handover đủ guard, chưa consume | CONSUMED | Unit IN_TRANSIT, movement duy nhất | System trong handover | A/E |
| RSV-05 / Reservation | ACTIVE | releaseDealerReservation | Owning cancellation hoặc expiry đã hợp lệ | RELEASED hoặc EXPIRED | Giải phóng đúng unit; không đổi IN_TRANSIT thành AVAILABLE | System | A/E |
| REQ-01 / PaymentRequest | chưa có | openFullPaymentRequest | Đơn mới còn active | OPEN / FULL_PAYMENT | Amount/transfer content/bank snapshot/dueAt | System | A qua order |
| REQ-02 / PaymentRequest | OPEN / FULL_PAYMENT | openBalanceRequest | Receipt đã phân bổ, funding thiếu, chưa có BALANCE | SUPERSEDED | Tạo OPEN/BALANCE với phần thiếu, deadline thiết lập một lần | System trong allocation | A/E qua order |
| REQ-03 / PaymentRequest | OPEN / BALANCE | recordPartialTopUp | Nguồn tiền hợp lệ, còn thiếu | OPEN / BALANCE | Projection còn thiếu; không đổi requiredAmount/deadline | System | A/E qua order |
| REQ-04 / PaymentRequest | OPEN | satisfyDealerPaymentRequest | Funding đủ theo ledger, không từ proof | SATISFIED | Đóng nghĩa vụ hiện hành, giữ history | System | A/E qua order |
| REQ-05 / PaymentRequest | OPEN | closeDealerPaymentRequest | Owning order cancel/expire | CANCELLED hoặc EXPIRED | Không xóa tiền; proof/history được giữ | System | A/E qua order |
| PRF-01 / PaymentProof | chưa có | submitDealerProof | Authorized private file đã validate; deadline còn, không proof review trùng | UNDER_REVIEW | Proof metadata + pause hold; file I/O trước transaction | Dealer | A/E |
| PRF-02 / PaymentProof | UNDER_REVIEW | acceptDealerProof | Nhân viên đối chiếu được receipt VERIFIED liên quan; không chỉ xem ảnh | ACCEPTED | Link receipt, end review theo funding; không cộng tiền lần hai | Staff | A/E |
| PRF-03 / PaymentProof | UNDER_REVIEW | rejectDealerProof | Lý do; order còn active | REJECTED | Restore clock/expire nếu cần; không đảo receipt thật đã ghi nhận | Staff | A/E |
| PRF-04 / PaymentProof | UNDER_REVIEW | closeProofOnCancellation | Owning force-cancel hợp lệ | CANCELLED | Giữ file/history cho late money reconciliation | System | A/E |
| BNK-01 / BankTransaction | chưa có | recordVerifiedBankReceipt | Nhân viên đã kiểm tra ngân hàng, ref unique, amount dương | VERIFIED | Bản ghi thực nhận bất biến; attribution nếu xác minh được; allocate riêng/cùng transaction khi đủ guard | Staff | A/E khi dealer known |
| BNK-02 / BankTransaction | VERIFIED | correctBankReceipt | Reversal an toàn sau đảo allocations, không shipment/refund ràng buộc | VERIFIED, net amount suy ra | Append correction + references/audit, projection; không UPDATE amount gốc | Admin | A/E |
| BNK-03 / BankTransaction | VERIFIED | openReceiptReconciliation | Có shipment/refund hoặc chưa rõ khả năng đảo | VERIFIED / reconciliation hold | Tạo case/hold; giữ lịch sử và nghĩa vụ thực tế | Admin | A/E safe |
| ALC-01 / PaymentAllocation | chưa có | allocateVerifiedReceipt | Cùng dealer, active Order, receipt đủ unallocated quota, không vượt order total | Append allocation có hiệu lực | Nguồn/request link, funding projection; không tin client amount aggregate | Staff/System | A/E |
| ALC-02 / PaymentAllocation | effectiveAmount > 0 | reverseAllocation | Không dùng phần đã giữ cho refund, chưa irreversible side effect, đúng correction context | EffectiveAmount giảm, có thể 0 | Append reversal idempotent, không sửa row gốc; update projection | Admin | A/E |
| REF-01 / Refund | chưa có | requestDealerRefund | Source verified, eligible amount/quota, destination version xác minh | REQUESTED | Source link + snapshot bank + quota held | Staff/System | A/E |
| REF-02 / Refund | REQUESTED | startDealerRefund | Đủ quota, source/destination không hold | PROCESSING | Processor/time, quota giữ nguyên; chưa đánh dấu đã chuyển | Staff | A/E |
| REF-03 / Refund | REQUESTED/PROCESSING | holdDealerRefund | Tài khoản không an toàn hoặc reconciliation | Status giữ nguyên / payoutHold=true | Lý do hold và audit; quota giữ nguyên | Admin/System | A/E safe |
| REF-04 / Refund | REQUESTED/PROCESSING, hold | releaseDealerRefundHold | Xác minh lại, chưa có transfer SENT/UNKNOWN; cùng destination snapshot hoặc case xử lý riêng | Status giữ nguyên / payoutHold=false | Không tạo refund thứ hai | Admin | A/E |
| REF-05 / Refund | PROCESSING | completeDealerRefund | Actual transfer đã xác minh, evidence riêng tư, đúng actor, source đủ quota | COMPLETED | Completion/evidence immutable, update projections; không tạo balance mới | Staff/Admin theo baseline | A/E |
| REF-06 / Refund | REQUESTED | rejectOrCancelDealerRefund | Lý do, chưa bắt đầu chuyển | REJECTED hoặc CANCELLED | Release quota; không xóa row | Staff/Admin | A/E |
| SHP-01 / Shipment | chưa có | prepareDealerShipment | Order CONFIRMED, funding đủ, unit held | CREATED | Order PROCESSING, fulfillment PREPARING, carrier/tracking | Staff | A/E |
| SHP-02 / Shipment | CREATED | handOverDealerShipment | Recheck funding, order PROCESSING, active reservation và inventory | HANDED_TO_CARRIER | Fulfillment IN_TRANSIT, consume reservation, unit IN_TRANSIT | Staff | A/E |
| SHP-03 / Shipment | HANDED_TO_CARRIER | deliverDealerShipment | Funding đủ; không COD | DELIVERED | Complete order/fulfillment, issue warranty, unit SOLD | Staff | A/E |
| SHP-04 / Shipment | HANDED_TO_CARRIER | failDealerShipment | Lý do thất bại | FAILED | Fulfillment FAILED, unit vẫn IN_TRANSIT | Staff | A/E |
| SHP-05 / Shipment | FAILED | receiveDealerReturn | Máy thực nhận về, đúng serial/location | RETURNED | Fulfillment RETURNED, unit INSPECTING; ghi phí/reason | Staff | A/E |
| SHP-06 / Shipment | CREATED | cancelDealerShipment | Owning order cancellation trước handover | CANCELLED | Cancel fulfillment; reservation release qua owning command | System | A/E |
| AFS-01 / AfterSalesRequest | chưa có | requestDealerAfterSales | Own order item, policy/coverage hợp lệ, không case mở trùng | REQUESTED | Snapshot complaint/recipient, không void warranty do business suspension | Dealer/Staff | A/E |
| AFS-02 / AfterSalesRequest | REQUESTED | receiveDealerAfterSales | Nhận đúng máy thực tế | RECEIVED | Inventory SOLD → INSPECTING, tiếp nhận timestamp | Staff | A/E |
| AFS-03 / AfterSalesRequest | RECEIVED | inspectDealerAfterSales | Inspection context hợp lệ | INSPECTING | Finding/cause/coverage độc lập | Staff | A/E |
| AFS-04 / AfterSalesRequest | INSPECTING | decideDealerAfterSales | Kết quả kiểm định, lý do và policy | APPROVED hoặc REJECTED | Quyết định, nghĩa vụ phí nếu có; trả máy nếu reject theo baseline | Staff | A/E |
| AFS-05 / AfterSalesRequest | APPROVED | resolveDealerAfterSales | REPAIRED có sửa xong; REPLACED có replacement reservation; REFUNDED có refund completed | RESOLVED | Ghi resolution, device links, warranty timeline; đổi khác giá tạo case liên kết đơn mới | Staff | A/E |
| AFS-06 / AfterSalesRequest | REQUESTED | cancelDealerAfterSales | Chưa nhận máy, đúng quyền | CANCELLED | Không void warranty hoặc sửa order history | Dealer/Staff | A/E |
| UNT-01 / InventoryUnit | AVAILABLE | reserveDealerUnit | Eligible và không ACTIVE reservation | AVAILABLE | Reservation ACTIVE; lifecycle không có RESERVED | System | A/E qua reservation/catalog |
| UNT-02 / InventoryUnit | AVAILABLE | handOverDealerShipment | Consume đúng active reservation | IN_TRANSIT | Movement và shipment cập nhật atomically | Staff/System | A/E |
| UNT-03 / InventoryUnit | IN_TRANSIT | deliverDealerShipment | Delivered transition hợp lệ | SOLD | Không tạo payment COD | Staff/System | A/E |
| UNT-04 / InventoryUnit | IN_TRANSIT/SOLD | receiveDealerReturn/AfterSales | Máy đã thực nhận, đúng owning case | INSPECTING | Inspection context; không tự AVAILABLE | Staff | A/E |
| UNT-05 / InventoryUnit | INSPECTING | completeResaleInspection | PASSED và điều kiện catalog/identifier/price đủ, không hold | AVAILABLE | Publish catalog availability theo baseline | Staff | A/E |
| UNT-06 / InventoryUnit | INSPECTING | returnAfterSalesDevice | Trả chính máy khách, case reject/repaired/unchanged hợp lệ | SOLD | Không ghi một sale mới; warranty timeline xử lý theo case | Staff | A/E |
| WRN-01 / Warranty | chưa có | issueDealerWarranty | Delivered order item, policy snapshot hợp lệ, chưa phát hành | ACTIVE | Code, kỳ hạn và liên kết máy/đơn; hiển thị đại lý bán và rePhone bảo hành | System | A/E |
| WRN-02 / Warranty | ACTIVE | recordWarrantyServicePeriod | After-sales repair thực tế, khoảng thời gian không trùng/không ghi hai lần | ACTIVE | Lưu service period, cập nhật kỳ hạn theo quyền lợi; không chỉ đổi device link | Staff/System | A/E |
| WRN-03 / Warranty | ACTIVE | replaceWarrantyDevice | Replacement đã cấp hợp lệ; policy thời hạn được áp dụng cho sự kiện đổi | ACTIVE | Machine lineage và mốc bảo hành mới được ghi/audit theo policy, giữ lịch sử cũ | Staff/System | A/E |
| WRN-04 / Warranty | ACTIVE | voidDealerWarranty | Refund resolution hoặc quyết định admin có căn cứ; không do đình chỉ đại lý | VOIDED | Reason/actor; không xóa warranty hay order | Admin/System theo case | A/E |

### Quy tắc phối hợp

- Order COMPLETED/CANCELLED và Reservation RELEASED/EXPIRED/CONSUMED là terminal; không hồi sinh khi tiền đến muộn. Các dòng mô tả cùng command trên nhiều đối tượng là một transaction, không phải nhiều API cập nhật status độc lập.
- REF-03 chỉ chặn payout mới. Nếu ngân hàng đã nhận lệnh hoặc chưa rõ kết quả, tạo reconciliation; không coi flag phần mềm là đảo giao dịch. Khi xác minh tiền đã đi, completion phải ghi nhận sự thật ngay cả khi hold được bật sau lúc gửi, qua quy trình staff/admin có audit; không gửi lại tiền.
- BNK-02/ALC-02 chỉ dùng khi reversal giữ được invariants. Sai sót sau giao/hoàn dùng BNK-03; không buộc dữ liệu thật phải vừa một phép toán bằng cách xóa lịch sử.
- API permission không quyết định quyền backoffice. Security lock chặn đối tác nhưng không làm shipment/after-sales terminal. Business status và security status không ghi đè nhau.
- Giao dịch expiry và verify lấy cùng order lock. Nếu verify thắng, expiry no-op; nếu cancel thắng, record tiền vẫn tồn tại để đối soát/hoàn, không allocate vào order hủy. Acceptance OPS-07 cần test nhiều PostgreSQL connection.
- ACTIVE reservation REVIEW không expiry nhưng có cảnh báo/SLA và giới hạn holds. Worker không tự giải phóng chỉ vì hết SLA review. Job và money commands lock/recheck aggregate, ghi audit/outbox trong cùng transaction.
