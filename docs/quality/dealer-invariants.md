# Dealer invariant và acceptance registry

[Spec](../requirements/dealer-channel.md) · [State matrix](../architecture/state-machines.md) · [Runbook](../operations/dealer-channel.md). Cưỡng chế dưới đây đã được nối vào module Dealers và engine chung. Unit policy không thay thế DB/HTTP; bằng chứng chạy cuối xem [bàn giao](../planning/2026-10-09-dealer-channel.md).

## Mapping kiểm thử

| ID | Bất biến / cưỡng chế | Kiểm thử |
|---|---|---|
| INV-RES-01 | Một reservation ACTIVE/máy; shared unique index, lock inventory, Serializable | Dealer E2E: concurrent creates, retail-vs-dealer race |
| INV-ORDER-01 | DEALER không cart/customer/guest identity; STOREFRONT giữ baseline | Migration 090200, upgrade harness và E2E immutable identity |
| INV-ORDER-02 | dealer + externalOrderId unique | Dealer E2E create/replay/conflicting payload |
| INV-IDEM-01 | Durable key/canonical payload, replay trước inventory revalidation | Dealer E2E order/refund/after-sales retry |
| INV-PRICE-01 | Giá đạt floor, thiếu cost/no advantage ẩn, integer VND | dealer-pricing.policy.spec.ts; create authoritative transaction |
| INV-BANK-01 | Unique account/reference, bank fact immutable, correction append-only | Dealer E2E duplicate receipt, DB direct mutation rejection |
| INV-ALLOC-01 | Net allocation + direct refund obligations <= effective receipt | Deferred aggregate triggers 090400; E2E overshoot/direct DB mutation; finance policy |
| INV-REF-01 | Refund REQUESTED/PROCESSING/COMPLETED không vượt nguồn; hold giữ quota | E2E concurrent refund, disable bank, finance policy |
| INV-REF-02 | Refund đúng một source, không đếm tiền hai lần | Unique refundId và deferred source sum; E2E split multi-source refunds |
| INV-MONEY-01 | Số nguyên VND, positive amounts, append-only reversals/corrections | DTO regex/Decimal/bigint/check constraints, policy và ledger E2E |
| INV-SHIP-01 | Chưa đủ tiền/hold không xuất; không COD | Fulfillment gateways; E2E unfunded simulator rejection và funded delivery |
| INV-TIMER-01 | Pause proof, reject resume; balance deadline không reset | Dealer E2E proof, partial receipts, expiry-vs-verification race; reservation policy |
| INV-TENANT-01 | Đúng tenant ở query/source; retail không đọc dealer; DTO allow-list | Dealer E2E tenant/scope/retail-hidden/private data; FK/trigger tenant checks |
| INV-ACCESS-01 | Business suspend giữ đơn cũ; security lock revoke | Dealer E2E suspended order/after-sales, revoked session/key, suppressed webhook |
| INV-STOCK-01 | Máy hoàn INSPECTING, không bán ngay; không release khi vận chuyển | Dealer E2E failed shipment/return/settlement/refund |
| INV-EVENT-01 | Outbox cùng commit, retry stable event/version, leased dispatch | Dealer E2E outbox, expired lease/HMAC rotation và concurrent workers; network unit |
| INV-ENV-01 | TEST/LIVE không dùng chung marker/key/simulation | dealer-runtime.service.spec.ts; mode-key E2E; simulator route conditional registration |

## Exception acceptance

- OPS-01/07: cancellation/expiry và tiền muộn giữ bank fact, không revive. E2E late receipt + expiry/verification race, proof pause/reject. Force-cancel admin gate được kiểm bằng dealer-core policy; audit nằm cùng transaction cancellation.
- OPS-02/04: security lock thu hồi key/session và suppress webhook; expired lease phục hồi. Hai dispatcher không gửi cùng endpoint đồng thời. HTTP callback failure không rollback đơn vì dispatcher chạy sau commit.
- OPS-03: disable bank khi refund PROCESSING giữ quota/snapshot; không cancel để lách quota. Hoàn chứng từ qua engine thật được kiểm bằng TEST return/refund.
- OPS-05: correction/reversal append-only + reconciliation hold; finance policy và deferred DB constraints bảo vệ arithmetic. Đối soát sao kê thực do người vận hành xác nhận theo runbook.
- OPS-06: suspended dealer vẫn đọc hậu mãi; lỗi/phạm vi/phí phải được assessment trước quyết định. E2E repaired warranty kiểm gia hạn một lần qua retry, trả máy SOLD đúng engine.

## Bộ kiểm thử

- `apps/api/src/modules/dealer-core/*.spec.ts`: tiền, access, deadline và quyết định ngoại lệ.
- `apps/api/src/modules/dealers/*.spec.ts`: pricing floor, môi trường/mã hóa, URL/DNS/SSRF transport.
- `apps/api/test/e2e/dealers.e2e.spec.ts`: HTTP guards + PostgreSQL thật, nhiều connection cho races, outbox workers, simulator, refund và hậu mãi. Chỉ HTTP outbound webhook được mock; ngân hàng/máy trong TEST là fixtures.
- `apps/api/test/migrations/dealer-upgrade.ts`: database tạm, baseline có Order/Payment, apply migrations và kiểm preservation.
- `tests/browser/dealer-flow.spec.ts`: portal tạo đơn → admin payment/delivery simulation → phiếu khách; responsive 360px, axe và public terms/API guide.
- Các suite bán lẻ/API/integration hiện hữu tiếp tục chạy cùng schema mới. Không tuyên bố pilot thật đã hoàn tất từ kết quả test.
