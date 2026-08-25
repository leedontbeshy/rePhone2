# Kế hoạch triển khai Slice 11 — Warranty & After-sales

> Trạng thái: 🚧 IN PROGRESS trên branch `feat/slice-11-warranty-aftersales` từ baseline Slice 10 `fb9db65`.<br>
> Baseline: Slice 10 có 111 OpenAPI operation; Slice 11 thêm đúng 32 operation và phải đạt 143.<br>
> Phụ thuộc: Warranty issuance từ Slice 08–09 và Refund workflow từ Slice 10 đã hoàn thành.<br>
> Không sửa `docs/decisions`; behavior hiện hành theo precedence tại [docs index](../readme.md#nguồn-sự-thật-khi-có-trùng-nội-dung).

## 1. Mục tiêu, phạm vi và quyết định đã khóa

Triển khai đầy đủ P0 cho warranty đã phát hành và after-sales intake/inspection/decision/resolution mà không làm sai lịch sử Order, inventory hoặc Refund. Slice hoàn thành khi:

- CUSTOMER xem warranty của mình; CUSTOMER/guest Order owner xem warranty detail và tạo/xem/cancel case hậu mãi đúng ownership.
- Warranty validity dùng snapshot với interval `[startAt,endAt)`; expiry tính động, không thêm trạng thái `EXPIRED` hoặc scheduler.
- EMPLOYEE/ADMIN nhận hàng, kiểm định, approve/reject và resolve case qua command có tên; ADMIN quản lý policy và void warranty.
- Receive iPhone atomically chuyển `SOLD → INSPECTING`; reject, repaired và returned-unchanged trả máy về `SOLD` mà không tạo sale movement mới.
- Replacement chỉ áp dụng cho iPhone cùng Product, có thể khác Variant; replacement unit khác máy gốc, `AVAILABLE`, không reservation và chỉ một transaction được quyền bán máy.
- Refunded resolution chỉ nhận một Refund `COMPLETED` thuộc cùng Order; command chỉ liên kết kết quả, không tự tạo hoặc hoàn tất Refund.
- Attachment JPEG/PNG/WebP/PDF nằm trong private bucket, tối đa 10 MiB/file và 5 file/case; signed URL tối đa 300 giây và không lộ storage metadata.
- Backoffice policy/warranty/case và storefront warranty/case có projection riêng, `Cache-Control: no-store`, ownership/RBAC/audit đúng contract.
- OpenAPI tăng `111 → 143`, generated client không drift; migration-from-zero, seed-safety, Supabase smoke và `pnpm verify` xanh.
- `plan.md` đánh dấu Slice 11 hoàn thành và chuyển bước kế tiếp sang Slice 12.

Không thuộc Slice 11:

- Repair order/task, kỹ thuật viên, linh kiện, chi phí sửa chữa hoặc workflow repair chi tiết.
- Direct accessory replacement; phụ kiện exchange dùng Refund + Order mới, stock chỉ tăng qua stock-return command.
- Manual warranty issuance, warranty restore/delete, evidence overwrite/delete hoặc public permanent URL.
- Hard-coded return/exchange eligibility window, auto-refund, auto-restock, payment gateway, Redis/queue/outbox, microservice hoặc multi-store allocation.
- Full UI design system, attachment preview nâng cao hoặc policy analytics.

Quyết định contract đã khóa:

1. **Đúng 32 HTTP operation mới/143 total.** Warranty issuance vẫn internal-only và không có manual create endpoint.
2. **Ba module một chiều.** `WarrantyModule` provider-only sở hữu issuance/repository/policy; `WarrantyOperationsModule` sở hữu policy/warranty HTTP; `AfterSalesModule` sở hữu case, attachment và workflow.
3. **Giữ issuer hiện có.** Pickup/shipping terminal transaction tiếp tục gọi một `WarrantyIssuanceService`; Slice 11 chỉ harden relation/projection và không tạo issuer thứ hai.
4. **Create policy luôn INACTIVE; code bất biến.** PATCH chỉ sửa name/defaultDays/terms cho policy chưa archive; snapshot cũ không đổi.
5. **`requestedResolution` thực sự optional.** Không gửi thì lưu `NULL`, không dùng empty string. Receive `note?` được persist vào `receiveNote`, trim 5..1000 khi có.
6. **Một unit có thể có nhiều warranty lịch sử.** Bỏ unique toàn cục trên `Warranty.inventoryUnitId`; unique `Warranty.orderItemId` vẫn bảo vệ issuance replay.
7. **Replacement cùng Product.** Variant được phép khác để xử lý thiếu cấu hình giống hệt; original unit vẫn `INSPECTING`, replacement chuyển `AVAILABLE → SOLD`, warranty chuyển unit nhưng giữ OrderItem/endAt/terms.
8. **Refund chỉ là prerequisite.** Mỗi resolved-refunded case liên kết một Refund `COMPLETED`, cùng Order và chưa được case refunded khác dùng; after-sales không mutate finance.
9. **Accessory không auto-restock.** Stock return dùng reference type `AFTER_SALES_REQUEST` và case ID để idempotent; command stock hiện hành là owner của counter/movement.
10. **Provider ngoài transaction.** Attachment upload trước transaction attach metadata; cleanup orphan best-effort. Email chạy sau commit.

## 2. Kiến trúc, API, projection và UI

```text
AppModule
├── FulfillmentModule
│   └── WarrantyModule              internal issuance port hiện có
├── WarrantyOperationsModule        policy + issued warranty HTTP
└── AfterSalesModule                intake + attachment + workflow HTTP
    ├── WarrantyModule
    ├── OrderTransactionPortsModule
    ├── InventoryModule
    ├── RefundCoreModule
    ├── StorageModule
    ├── AuditModule
    └── NotificationsModule
```

- `WarrantyModule` export issuer, read/lock gateway và policy dùng lại; không chứa controller.
- `WarrantyOperationsModule` gọi narrow port để query/update policy, query/void warranty và kiểm tra Product/Variant reference trước archive.
- `AfterSalesModule` dùng Order ownership policy hiện hành, transaction ports của Inventory/Refund/Warranty và không gọi application service khác từ interactive transaction.
- Mọi repository nhận `Prisma.TransactionClient`; không nested transaction, `forwardRef`, controller gọi Prisma hoặc network call trong transaction.
- Business transaction nhiều bảng dùng `SerializableTransactionRunner` hiện hành; read-only list/detail không mặc định dùng Serializable.

### API — đúng 32 operation mới

#### Storefront Warranty và After-sales — 8 operation

| Method/path | operationId | Actor | Success |
|---|---|---|---|
| `GET /api/v1/warranties` | `listCustomerWarranties` | CUSTOMER | Paginated `WarrantyListItemDto` |
| `GET /api/v1/warranties/:warrantyCode` | `getCustomerWarranty` | Owner CUSTOMER/guest | `WarrantyDetailDto` |
| `GET /api/v1/after-sales` | `listCustomerAfterSalesRequests` | CUSTOMER | Paginated `AfterSalesListItemDto` |
| `POST /api/v1/after-sales` | `createAfterSalesRequest` | Owner CUSTOMER/guest | `201 AfterSalesDetailDto` |
| `GET /api/v1/after-sales/:requestNumber` | `getAfterSalesRequest` | Owner CUSTOMER/guest | `AfterSalesDetailDto` |
| `POST /api/v1/after-sales/:requestNumber/attachments` | `uploadAfterSalesAttachment` | Owner CUSTOMER/guest | Updated attachment summary |
| `GET /api/v1/after-sales/:requestNumber/attachments/:attachmentId/url` | `getAfterSalesAttachmentUrl` | Owner CUSTOMER/guest | `{ url, expiresAt }` |
| `POST /api/v1/after-sales/:requestNumber/cancel` | `cancelAfterSalesRequest` | Owner CUSTOMER/guest | `AfterSalesDetailDto` |

#### Backoffice WarrantyPolicy và Warranty — 10 operation

| Method/path | operationId | Actor | Success |
|---|---|---|---|
| `GET /api/v1/backoffice/warranty-policies` | `listBackofficeWarrantyPolicies` | EMPLOYEE/ADMIN | Paginated policy list |
| `POST /api/v1/backoffice/warranty-policies` | `createWarrantyPolicy` | ADMIN | `201` INACTIVE policy |
| `GET /api/v1/backoffice/warranty-policies/:id` | `getBackofficeWarrantyPolicy` | EMPLOYEE/ADMIN | Policy detail |
| `PATCH /api/v1/backoffice/warranty-policies/:id` | `updateWarrantyPolicy` | ADMIN | Policy detail |
| `POST /api/v1/backoffice/warranty-policies/:id/activate` | `activateWarrantyPolicy` | ADMIN | ACTIVE policy |
| `POST /api/v1/backoffice/warranty-policies/:id/deactivate` | `deactivateWarrantyPolicy` | ADMIN | INACTIVE policy |
| `POST /api/v1/backoffice/warranty-policies/:id/archive` | `archiveWarrantyPolicy` | ADMIN | Archived policy |
| `GET /api/v1/backoffice/warranties` | `listBackofficeWarranties` | EMPLOYEE/ADMIN | Paginated warranty list |
| `GET /api/v1/backoffice/warranties/:id` | `getBackofficeWarranty` | EMPLOYEE/ADMIN | Warranty detail |
| `POST /api/v1/backoffice/warranties/:id/void` | `voidWarranty` | ADMIN | VOIDED warranty |

#### Backoffice After-sales — 14 operation

| Method/path | operationId | Success/effect |
|---|---|---|
| `GET /api/v1/backoffice/after-sales` | `listBackofficeAfterSalesRequests` | Paginated case list |
| `GET /api/v1/backoffice/after-sales/:id` | `getBackofficeAfterSalesRequest` | Operational detail |
| `GET /api/v1/backoffice/after-sales/:id/attachments/:attachmentId/url` | `getBackofficeAfterSalesAttachmentUrl` | `{ url, expiresAt }` |
| `POST /api/v1/backoffice/after-sales/:id/assign` | `assignAfterSalesRequest` | Assign/unassign active EMPLOYEE |
| `POST /api/v1/backoffice/after-sales/:id/receive` | `receiveAfterSalesRequest` | REQUESTED → RECEIVED |
| `POST /api/v1/backoffice/after-sales/:id/start-inspection` | `startAfterSalesInspection` | RECEIVED → INSPECTING |
| `POST /api/v1/backoffice/after-sales/:id/record-inspection-summary` | `recordAfterSalesInspectionSummary` | Update summary |
| `POST /api/v1/backoffice/after-sales/:id/approve` | `approveAfterSalesRequest` | INSPECTING → APPROVED |
| `POST /api/v1/backoffice/after-sales/:id/reject` | `rejectAfterSalesRequest` | INSPECTING → REJECTED |
| `POST /api/v1/backoffice/after-sales/:id/resolve-repaired` | `resolveAfterSalesRepaired` | APPROVED → RESOLVED/REPAIRED |
| `POST /api/v1/backoffice/after-sales/:id/resolve-replaced` | `resolveAfterSalesReplaced` | APPROVED → RESOLVED/REPLACED |
| `POST /api/v1/backoffice/after-sales/:id/resolve-refunded` | `resolveAfterSalesRefunded` | APPROVED → RESOLVED/REFUNDED |
| `POST /api/v1/backoffice/after-sales/:id/resolve-returned-unchanged` | `resolveAfterSalesReturnedUnchanged` | APPROVED → RESOLVED/RETURNED_UNCHANGED |
| `POST /api/v1/backoffice/after-sales/:id/resolve-other` | `resolveAfterSalesOther` | APPROVED → RESOLVED/OTHER |

Backoffice After-sales read/workflow dành cho EMPLOYEE/ADMIN; riêng `resolve-other` ADMIN-only. Tất cả success/error response có `Cache-Control: no-store`; mutation giới hạn 120 request/phút/staff actor.

### Identity, request và query contract

- Reuse `OrderOwnershipPolicy`: Bearer CUSTOMER có precedence; staff Bearer nhận 403 và không fallback guest. Nếu không có Bearer, chấp nhận `X-Guest-Order-Token`, sau đó converted guest-cart cookie còn hạn.
- Cookie-auth mutation phải qua exact Origin, JSON/multipart content rule và `X-Rephone-CSRF: 1`; Bearer/header-token không cần CSRF.
- Wrong warranty/case/order ownership luôn trả `RESOURCE_NOT_FOUND`; request number/warranty code không phải credential.
- Create case: `{ orderItemId, type, issueDescription, requestedResolution? }`; description 10..2000, requested resolution trim/nonblank tối đa 500 khi có.
- WARRANTY chỉ tạo nếu warranty ACTIVE và `startAt <= now < endAt`; validity chỉ kiểm tra khi create. RETURN/EXCHANGE không có hard-coded window.
- Request number dùng CSPRNG `RPH-AS-YYYYMMDD-XXXXXX`, alphabet không gây nhầm và timezone StoreSettings; chỉ retry đúng unique collision.
- Assign `{ employeeId?: UUID | null }`: null/omit dùng unassign; non-null phải là ACTIVE EMPLOYEE.
- Receive `{ receivedLocationId, note? }`: location ACTIVE, `receiveNote` 5..1000 khi có. Approve note 5..2000; reject reason 5..2000 và iPhone bắt buộc returnNote 5..1000.
- Resolution note 5..2000; replace/refund nhận UUID tương ứng; client không gửi status, finance amount hoặc inventory lifecycle.
- Storefront case list filter `type?, status?, page, pageSize`, order `requestedAt desc, id desc`.
- Policy list dùng `q?, status?, archived?, page, pageSize`; warranty list dùng `q?, status?, validity?, page, pageSize`.
- Backoffice case list dùng `q?, type?, status?, assignedToId?, createdFrom?, createdTo?, page, pageSize, sortBy=createdAt|updatedAt|requestedAt, sortOrder`; luôn thêm `id` tie-breaker.

### Projection và UI

- Public warranty DTO chỉ dùng OrderItem snapshot, product/variant/unit inventory code, masked identifier suffix, days/terms, interval/status và computed `isValid/isExpired`; không cost/raw identifier/internal note.
- Public case DTO chỉ có request data, safe status timeline, attachment ID/MIME/size/uploadedAt, decision/resolution customer-safe text; không storage path, signed URL, staff internal identity hoặc raw checklist.
- Backoffice detail có safe customer/order/item snapshot, assignment/location, inspection link/summary, attachment metadata, decision/resolution/refund/warranty summary và backend-authoritative `availableActions`.
- `/warranties`, `/warranties/[warrantyCode]`, `/after-sales`, `/after-sales/[requestNumber]` hỗ trợ owner list/detail/create/upload/cancel; completed Order detail có CTA mở warranty/tạo case.
- `/backoffice/warranty-policies`, `/backoffice/warranties`, `/backoffice/after-sales`, `/backoffice/after-sales/[id]` hỗ trợ query và command theo role; staff header thêm “Hậu mãi”.
- UI không tự suy diễn transition; action card đọc `availableActions`, disable double-submit, refetch sau success/conflict, focus alert và có label/aria-live/mobile width cơ bản.

## 3. Database, transaction, attachment và failure handling

### Forward migration và exact preflight

Không sửa baseline migration và không thêm bảng. Forward migration:

- Đổi `AfterSalesRequest.requestedResolution` thành nullable; nếu có phải trim nonblank và tối đa 500 ký tự.
- Thêm nullable `receiveNote` TEXT; nếu có phải trim nonblank 5..1000 ký tự.
- Đổi default `WarrantyPolicy.status` thành INACTIVE; code uppercase 1..64 và bất biến ở application; defaultDays `0..3650`, name/terms không blank, terms tối đa 10000.
- Enforce archive shape: `archivedAt != null` chỉ đi với INACTIVE; archived policy không activate/update.
- Giữ unique Warranty/OrderItem và exact interval đã có; bỏ unique `Warranty.inventoryUnitId`, thay bằng non-unique index để một physical unit có nhiều warranty lịch sử qua các lần bán.
- Tighten Warranty ACTIVE/VOIDED field shape, reason length và actor/time; expiry vẫn computed, không enum hoặc persisted field mới.
- Tighten AfterSales status/timestamp/actor/note shape, attachment JSON array tối đa 5, resolution-specific fields và partial unique một non-terminal case/OrderItem.
- Add queue indexes phục vụ policy/warranty/case queries; chỉ giữ index đã chứng minh bởi query plan, không index mọi enum.
- Mở rộng stock-return reference allowlist với `AFTER_SALES_REQUEST`; unique reference bảo vệ một return movement cho cùng case/variant.

Preflight dừng rollout nếu có policy/archive shape sai, duplicate warranty/order item, warranty interval/void shape sai, một unit có dữ liệu warranty bất thường cần điều tra, case lifecycle/timestamp/attachment sai, nhiều active case/item, warranty/order-item mismatch hoặc resolution/refund/replacement không hợp lệ. Không auto-fix/backfill dữ liệu lạ.

### Warranty policy, query và void

- Create canonicalize code uppercase và luôn ghi INACTIVE; code không xuất hiện trong PATCH.
- Update chỉ name/defaultDays/terms của non-archived policy. Snapshot OrderItem/Warranty không đọc lại policy hiện tại.
- Activate/deactivate/archive là named command; deactivate/archive reason 5..500 và AuditLog. Archive chặn active Product/Variant reference và terminal, không hard-delete/restore.
- Void lock Warranty, require ACTIVE, lưu reason/actor/time và audit; expired warranty vẫn có thể void để ghi lịch sử. Void không tự cancel case đã mở.

### Intake và ownership

Create case chạy Serializable:

1. Resolve OrderItem + completed Order và ownership.
2. Lock OrderItem; recheck partial-unique active case.
3. Với WARRANTY, lock/validate warranty thuộc đúng OrderItem và valid tại thời điểm create; backend tự resolve warranty ID.
4. Với RETURN/EXCHANGE, không hard-code day window và không nhận warranty ID từ client.
5. Sinh request number, lưu `requestedResolution=NULL` khi omit, customerId null cho guest và AuditLog safe.
6. Commit rồi mới gửi `after_sales.updated`.

Hai create đồng thời chỉ một case thắng; unique conflict map `AFTER_SALES_REQUEST_ALREADY_OPEN`. Case đã tạo tiếp tục workflow dù warranty hết hạn sau requestedAt.

### Private attachment

- Authorize owner/role và state trước multipart; chỉ REQUESTED/RECEIVED/INSPECTING nhận thêm file.
- Nhận đúng một field `file`, JPEG/PNG/WebP/PDF tối đa 10 MiB; dùng shared validator (`sharp`/`pdf-lib`) để reject empty, malformed, MIME spoof, SVG, HEIC và executable.
- Server sinh `after-sales/{requestId}/{uuid}.{ext}` trong private bucket, `upsert=false`; JSONB chỉ lưu attachment UUID, bucket/path, detected MIME/size, uploader type/id và uploadedAt.
- Upload ngoài transaction. Serializable attach lock case, recheck ownership/state/count rồi append metadata; request thứ sáu hoặc concurrent loser xóa exact object best-effort.
- Cleanup fail ghi `storage_orphan_candidate`; object vẫn private. Signed read authorize từng attachment, audit trước response, TTL `min(config,300 giây)` và PDF download disposition.
- Public DTO/log/audit không chứa bucket, object path, signed URL hoặc credential. Upload giới hạn 20 request/10 phút/actor hoặc guest credential.

### Receive, inspection và decision

- Receive lock case trước original unit. Require REQUESTED, ACTIVE location và persist actor/time/location/receiveNote.
- iPhone atomically chuyển `SOLD → INSPECTING` và đổi location; accessory không tăng stock/counter/movement.
- Start inspection chỉ RECEIVED. WARRANTY case tạo/link một DRAFT `InventoryInspection.WARRANTY`; RETURN/EXCHANGE dùng `InventoryInspection.RETURN`. Accessory chuyển INSPECTING không tạo inventory inspection.
- iPhone decision require linked inspection COMPLETED, không bắt buộc result PASSED vì đây là defect assessment. Accessory require inspectionSummary 10..2000.
- Approve chỉ ghi decision fields và case APPROVED; chưa mutate outcome.
- Reject iPhone atomically set returnNote/returnedAt, chuyển original unit `INSPECTING → SOLD`, không tạo SALE movement; accessory không tự nhập tồn. Notification sau commit và replay không gửi lại.

### Typed resolution

Mọi resolution chạy Serializable, lock theo thứ tự ổn định:

```text
AfterSalesRequest → OrderItem/Warranty/Refund
                  → original/replacement InventoryUnit sorted
                  → StockLevel/Movement khi gọi stock-return port
```

- `REPAIRED` và `RETURNED_UNCHANGED`: iPhone `INSPECTING → SOLD`, set returnedAt, không đổi completed Order hoặc tạo sale movement; accessory không stock effect.
- `REPLACED`: iPhone-only; replacement khác original, same Product, active Variant, AVAILABLE và không reservation. Replacement `→ SOLD/soldAt`, Warranty.inventoryUnitId chuyển replacement nhưng giữ original OrderItem/snapshot; original unit ở INSPECTING.
- `REFUNDED`: Refund phải COMPLETED, thuộc cùng Order và chưa được một REFUNDED case khác dùng; case chỉ link Refund. Warranty liên quan chuyển VOIDED; original iPhone giữ INSPECTING.
- `OTHER`: ADMIN-only, chỉ lưu result/note/audit; không tự mutate inventory/payment.
- Conditional `APPROVED → RESOLVED` bảo đảm hai staff resolve chỉ một command thắng. Exact replay trả current case, không double-sell, double-void, double-link Refund, audit hoặc email.
- Accessory đủ điều kiện trở lại bán chỉ qua stock-return command với reference `AFTER_SALES_REQUEST`; after-sales resolution không viết counter trực tiếp.

## 4. Test matrix và quality gates

- **Unit:** warranty validity/end-exclusive; policy mutability/archive; owner/guest credential; request-number collision; DTO normalization; attachment validation/count; state/actions; inspection mapping; replacement/refund policy; safe projection/notification.
- **Database/integration:** nullable requestedResolution và receiveNote constraints; policy default/archive; non-unique inventory warranty history; one active case; lifecycle field shape; attachment array max; stock return reference; issuer replay và seed operational-state safety.
- **Concurrency dùng barrier/latch, không sleep:** two-create one item; fifth/sixth attachment; receive/cancel; two start-inspection; approve/reject; two replacement cases cùng unit; resolution replay; refund resolution race với Refund state; warranty void/create case boundary.
- **E2E/security:** đúng 32 route; guest/customer ownership 404; guest cannot list; staff/admin matrix; cookie CSRF/Bearer precedence; policy lifecycle; warranty void/query; full case create→receive→inspect→approve/reject/resolve; 409/413/415/422/429/503; no-store/redaction.
- **Contract/web:** đúng 143 unique operationId, Bearer/cookie/header security OR, UUID/code paths, multipart schema, generated client không drift; customer/backoffice routes và authoritative actions.
- **Regression:** Slice 01–10 xanh; fulfillment vẫn issue đúng một Warranty; Refund/inventory/stock projection không đổi sai; returned unit không public trước passed reinspection + make-available.
- **Performance:** list/detail/normal command p95 dưới 500 ms ở 20–50 concurrent users với fake Storage/SMTP; list batch-query, không N+1. Upload/provider latency không tính vào command DB target.

Quality gate:

```text
pnpm format:check → pnpm lint → pnpm typecheck → pnpm test
→ pnpm test:db:prepare → pnpm test:integration → pnpm test:e2e
→ pnpm api:openapi → pnpm api:client → pnpm build → pnpm verify
```

Một work package không commit/push nếu gate liên quan chưa xanh. Không stage `apps/web/next-env.d.ts`.

## 5. Work packages, rollout và Decision Log

| WP | Nội dung | Commit dự kiến | Nguồn contract chính |
|---|---|---|---|
| 0 | Plan chi tiết, clarification requestedResolution/receiveNote và root plan IN PROGRESS | `docs(plan): detail slice 11 implementation` | Roadmap, root plan, API/data contract |
| 1 | Exact preflight, forward migration, constraints/indexes và seed safety | `feat(db): enforce warranty after-sales invariants` | Database implementation, after-sales data |
| 2 | Warranty provider-only core, AfterSales ports và transaction gateways | `refactor(api): expose warranty after-sales transaction ports` | Backend modules, transaction strategy |
| 3 | Policy lifecycle, warranty query/void và issuer hardening | `feat(api): add warranty policy and access operations` | Warranty API, state machine |
| 4 | Customer/guest case create/list/detail/cancel và ownership | `feat(api): add after-sales request intake` | Warranty API, auth transport, roles |
| 5 | Private attachment upload/read, count race và orphan cleanup | `feat(api): add private after-sales attachments` | File pipeline, threat model |
| 6 | Assign/receive/start inspection/summary và inventory transition | `feat(api): add after-sales receive and inspection` | Inventory model/checklist, API |
| 7 | Approve/reject và return-to-customer invariant | `feat(api): add after-sales decision workflow` | State machines, API |
| 8 | Five typed resolution, replacement/refund/stock ports | `feat(api): resolve after-sales cases atomically` | Warranty requirement, Refund/Inventory contracts |
| 9 | Public/backoffice DTO, actions, audit và notifications | `feat(api): expose safe warranty after-sales projections` | Response contract, notifications |
| 10 | OpenAPI 143 operation và generated client | `chore(api): generate slice 11 contracts` | OpenAPI/client, endpoint inventory |
| 11 | Customer warranty/case/create/upload/cancel UI | `feat(web): add customer warranty after-sales portal` | Storefront Warranty/After-sales API |
| 12 | Policy/warranty query và after-sales queue/detail/action UI | `feat(web): add after-sales operations backoffice` | Roles, backoffice API |
| 13 | Guarded `after-sales-inspecting` demo scenario | `feat(demo): add after-sales inspecting scenario` | Seed/demo scenarios |
| 14 | Unit/integration/E2E/concurrency/security/performance coverage | `test(after-sales): cover slice 11 invariants` | Testing strategy, NFR, traceability |
| 15 | Guarded Supabase preflight/smoke script | `test(after-sales): add Supabase slice 11 smoke` | Deployment runbook, file pipeline |
| 16 | Rollout, nghiệm thu và chuyển root plan sang Slice 12 | `docs(plan): mark slice 11 complete` | Roadmap, traceability |

Mỗi commit chỉ chứa một concern, chạy gate liên quan và push riêng lên `origin/feat/slice-11-warranty-aftersales`. Không chỉnh sửa `docs/decisions`.

### Supabase rollout

1. Xác nhận đúng database/private bucket và backup, không in secret.
2. Chạy exact preflight cho policy, warranty, case lifecycle/relation/attachment và stock reference.
3. `pnpm db:deploy`; không reset/down migration.
4. Deploy API rồi Web; Storage vẫn chỉ qua service-role backend.
5. Chạy seed hai lần và so fingerprint Order/Warranty/AfterSales/Refund/Inventory/StockMovement.
6. Customer completed Order: list/detail Warranty, create WARRANTY case và upload attachment thật.
7. EMPLOYEE assign → receive → start inspection → complete inspection → approve → resolve repaired; replay và đối chiếu unit/Warranty/Audit/email.
8. Tạo case thứ hai để reject và xác nhận iPhone trở lại SOLD không có SALE movement.
9. Smoke replacement trên dedicated unit và refunded resolution trên dedicated completed Refund; xác nhận no double-sell/no finance mutation.
10. Lấy owner/staff signed URL, kiểm tra TTL/private policy/no-store và log redaction.
11. Chạy guarded `after-sales-inspecting` scenario, full `pnpm verify`, cập nhật plan và push từng commit.

Smoke không dùng SQL để chuyển business state; database access trực tiếp chỉ dùng cho preflight/fingerprint/assertion.

### Rollback và scope cut

- Không down migration, reset database, xóa Warranty/case/attachment/history hoặc sửa inventory/refund bằng SQL.
- Schema additive/tightened được giữ khi rollback code về `fb9db65`; completed Warranty vẫn an toàn và private object vẫn private.
- Không rollback application khi có case thật RECEIVED/INSPECTING/APPROVED; resolve hoặc forward-fix trước để không mất operation API.
- Cleanup orphan chỉ theo exact private bucket/path đã xác minh.
- Khi trễ, cắt filter UI phụ, attachment preview, policy UI polish, email HTML, browser-smoke breadth và accessory warranty UI trước.
- Không cắt 32 API, ownership/RBAC, private attachment, receive/decision/resolution transaction, replacement/refund invariant, migration/audit hoặc concurrency tests.

| Quyết định | Phương án không chọn | Lý do |
|---|---|---|
| Warranty core + Operations + AfterSales | Gộp hết vào Fulfillment/Orders | Giữ issuer nội bộ ổn định và cô lập HTTP/workflow hậu mãi |
| Nullable requestedResolution + persisted receiveNote | Empty string/discard note | Contract phản ánh đúng optional input và không mất dữ liệu vận hành |
| Policy create INACTIVE/code immutable | DB default ACTIVE/mutable code | Tránh policy chưa duyệt áp dụng và giữ reference ổn định |
| Bỏ unique Warranty.inventoryUnitId | Một warranty/unit suốt đời | Physical unit có thể được hoàn, bán lại và có warranty lịch sử mới |
| Same Product, variant có thể khác | Bắt buộc exact variant hoặc bất kỳ iPhone | Cân bằng inventory thực tế với tính tương thích/scope P0 |
| Link completed Refund only | After-sales tự tạo/complete Refund | Không nhân đôi financial workflow và invariant Slice 10 |
| AFTER_SALES_REQUEST stock reference | Auto-restock/ghi counter trực tiếp | Stock movement có nguồn rõ và idempotent qua module Inventory |
| JSONB attachment tối đa 5 | Bảng attachment/generic media CRUD | Baseline data model đủ cho P0, không mở thêm table/controller |
| Signed URL <=300s | Public/permanent attachment URL | Bắt buộc authorize mỗi lần và giảm rủi ro lộ evidence |
| Expiry computed | Scheduler/EXPIRED enum | Tránh stale state và đúng snapshot interval contract |

## Nguồn contract

- [Warranty và After-sales requirements](../requirements/warranty-and-aftersales.md)
- [Warranty và After-sales API](../api/warranty-and-aftersales-endpoints.md)
- [After-sales data dictionary](../data-model/after-sales.md)
- [State machines](../architecture/state-machines.md)
- [Backend module boundaries](../architecture/backend-modules.md)
- [Database implementation](../architecture/database-implementation.md)
- [File upload pipeline](../architecture/file-upload-pipeline.md)
- [Transaction và concurrency](../architecture/transaction-and-concurrency.md)
- [Roles và permissions](../requirements/roles-and-permissions.md)
- [Testing strategy](../quality/testing-strategy.md)
- [Requirements traceability](../quality/requirements-traceability.md)
- [Seed/demo scenarios](seed-and-demo-scenarios.md)
- [Deployment runbook](../operations/local-development-and-deployment.md)
