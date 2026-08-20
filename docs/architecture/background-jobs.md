# Background jobs P0

P0 dùng `@nestjs/schedule` ngay trong một API process. Không có Redis, BullMQ, worker service hay distributed scheduler. Deployment demo chỉ chạy một API replica; handler vẫn idempotent và update theo expected state để lần chạy lặp không tạo tác dụng kép.

## 1. Danh sách job

| Job | Lịch | Batch | Hành vi |
|---|---|---:|---|
| `expireDepositProofs` | mỗi phút | 100 orders | Shipping deposit `AWAITING_PROOF` đã quá `expiresAt`: cancel order/fulfillment/payment, expire reservation, release voucher và tạo refund nếu invariant yêu cầu |
| `expirePickupHolds` | mỗi phút | 100 orders | Pickup chưa hoàn tất đã quá `pickupHoldUntil`: cancel order/fulfillment, expire reservation, release voucher, tạo refund request nếu đã thu tiền |
| `markExpiredGuestCarts` | mỗi giờ phút 17 | 200 carts | ACTIVE guest cart có `expiresAt <= now` thành EXPIRED; không đụng customer cart |
| `purgeExpiredAuthRecords` | 02:15 hằng ngày | 500 rows | Xóa session/token đã expired/revoked quá 30 ngày và không còn giá trị audit nghiệp vụ |
| `reportOverduePaymentReviews` | mỗi 15 phút | 100 payments | Log/audit cảnh báo deposit `UNDER_REVIEW` quá SLA snapshot; không auto reject/cancel |

Tất cả schedule dùng timezone UTC. Deadline lấy từ timestamp đã snapshot, nên không phụ thuộc timezone process.

## 2. Transaction của expiry

Mỗi order là một transaction riêng; batch không mở một transaction dài:

1. Query tối đa batch size ID ứng viên theo `(status, expiresAt)`.
2. Với từng ID, chạy application command system actor ở isolation đã định nghĩa.
3. Command re-read row và chỉ transition khi expected state/deadline vẫn đúng.
4. Release reservation/voucher, update inventory counters, payment/order projections và AuditLog trong cùng transaction.
5. Sau commit mới gửi notification best-effort.

Nếu payment proof vừa được submit, conditional transition của một phía thắng; phía còn lại nhận no-op/domain conflict và không để trạng thái nửa vời.

## 3. Chống overlap và retry

- Process-local mutex bỏ qua tick mới nếu lần cũ của cùng job chưa xong; log `job.skipped_overlap`.
- Command per-row idempotent và khóa/conditional update đúng record; một ID lỗi không rollback cả batch.
- Transient serialization/deadlock retry tối đa 3 lần với jitter như transaction strategy.
- Job-level không retry vòng vô hạn. Record lỗi sẽ được xét lại ở tick sau nếu state còn phù hợp.
- Một batch dừng khi đạt `SCHEDULER_BATCH_SIZE`; tick sau lấy tiếp.

Không dùng `setInterval` tự viết. Trong test/CLI migration, `SCHEDULER_ENABLED=false` để tránh side effect.

## 4. Failure policy

- Database unavailable: job fail nhanh, API readiness fail; tick sau thử lại.
- Một order invalid/invariant lỗi: log error có job name/order ID/request ID hệ thống, tiếp tục record khác; không log PII/raw payment data.
- Email fail sau commit không rollback expiry; xem notification policy.
- Overdue review chỉ quan sát. Không tự quyết định tiền của khách dựa vào SLA.

## 5. System actor và audit

Job tạo request ID dạng `job:<name>:<runUuid>` và `AuditLog.actorType=SYSTEM` cho business transition. Không audit từng cart/token cleanup vì không phải lịch sử nghiệp vụ; chỉ structured log số lượng.

Metric/log kết thúc một run:

```json
{
  "event": "job.completed",
  "job": "expireDepositProofs",
  "runId": "...",
  "scanned": 42,
  "succeeded": 40,
  "noop": 1,
  "failed": 1,
  "durationMs": 380
}
```

## 6. Giới hạn và đường nâng cấp

Một API replica là ràng buộc P0. Khi cần nhiều replica hoặc delivery guarantee cao, tách scheduler/worker và dùng PostgreSQL claim/outbox hoặc queue; không mở rộng trong đồ án tháng đầu. Các command idempotent hiện tại là điểm nối để nâng cấp mà không đổi domain state machine.

## 7. Acceptance tests

- Expire đúng một lần dù handler gọi lặp.
- Submit proof chạy cạnh expiry cho kết quả nhất quán duy nhất.
- Pickup có verified payment hết hạn tạo đúng một refund obligation.
- Deposit đang UNDER_REVIEW không bị auto-cancel.
- Guest cart customer/ACTIVE chưa quá hạn không bị chạm.
- Một record lỗi không chặn phần còn lại của batch.

## Liên kết

- [State machines](state-machines.md)
- [Transaction và concurrency](transaction-and-concurrency.md)
- [Notification delivery](notifications.md)
- [Observability](observability.md)
