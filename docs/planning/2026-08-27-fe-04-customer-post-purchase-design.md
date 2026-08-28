# FE-04 — Customer post-purchase portal design

> Status: **APPROVED**<br>
> Date: **2026-08-27**<br>
> Contract review: **2026-08-28**<br>
> Phase: **FE-04**<br>
> Chosen visual direction: **Hành trình theo chặng**<br>
> Implementation status: **Complete**

## 1. Outcome

FE-04 redesigns the existing customer post-purchase pages into one coherent
portal for orders, warranty and support after purchase. The phase reuses the
implemented backend contracts and transport helpers; it does not introduce a
new business state machine.

The customer-facing outcome is:

- customers can review their orders, payment, delivery, refund, warranty and
  support requests in one consistent place;
- a guest purchaser can safely reopen only the detail resources that belong to
  the guest order;
- every detail screen clearly answers “What is happening now?” and “What can I
  do next?”;
- customer copy is natural Vietnamese and does not expose implementation or
  security terminology;
- the seven routes share the FE-03 storefront header and a local
  `Đơn hàng — Bảo hành — Hỗ trợ sau mua` navigation.

## 2. Understanding summary

- Build a unified post-purchase experience across seven existing routes and
  twelve existing frontend operations.
- Serve signed-in customers and guest order owners without exposing guest list
  data or resource existence to another owner.
- Make the lifecycle journey the primary visual explanation on detail pages.
- Preserve backend authority for ownership, available actions, money, status
  transitions, warranty validity and attachment access.
- Reuse the FE-03 storefront header, customer readability mode and design
  tokens; do not create a separate visual system.
- Do not redesign the backend, add public evidence previews, invent policy,
  promise resolution time or expose private storage information.

## 3. Assumptions and non-functional requirements

### 3.1 Product assumptions

- FE-02 and FE-03 are the visual and navigation baseline.
- Backend contracts, OpenAPI and generated client are already available.
- The phase covers all twelve operations rather than shipping a partial portal.
- Mockup content is presentation evidence only. Runtime status, amounts,
  dates, availability and actions come from authoritative projections.
- Customer-facing copy uses Vietnamese. Brand and common product terms such as
  `rePhone`, `iPhone`, `USB-C`, `Lightning`, `MagSafe`, `Wi-Fi`, `PDF`, `GB`,
  `KB` and `MB` may remain when they are useful to the customer.

### 3.2 Performance and scale

- Design for the project baseline of 20–50 concurrent users.
- List views use server pagination and do not fetch all records to filter or
  sort in the browser.
- Preserve the existing p95 target below 500 ms for list/detail/normal command
  calls in the seeded environment, excluding external storage and mail.
- Avoid N+1 detail loading. Private post-purchase route shells remain client
  orchestrators because the current access token is held by `AuthProvider` in
  browser memory. Keep presenters pure and split interaction-heavy sections
  into narrow components; do not introduce a new BFF/server-session contract
  inside FE-04.
- Treat the storefront mobile budgets (LCP `<= 2.5s`, CLS `<= 0.1`, INP
  `<= 200ms`) as tracked quality targets. They become a hard FE-04 release gate
  only when a repeatable measurement harness exists; otherwise record the
  representative measurement and any debt explicitly.

### 3.3 Privacy and security

- Signed-in customer identity takes precedence over guest order access. A
  customer request must not fall back to, forward or reuse a guest credential
  for another order.
- Guests cannot open customer collection routes.
- Wrong ownership, an invalid guest order token and an expired converted-cart
  credential render the same safe not-found state; the UI must not reveal
  whether a resource exists.
- Guest credentials never appear in query strings, SSR HTML, logs, analytics or
  persistent browser storage.
- Guest mutations authenticated by the converted-cart cookie preserve the
  existing exact-Origin and `X-Rephone-CSRF: 1` requirements. Bearer and valid
  order-token requests do not rely on cookie authentication, and credentials
  are never forwarded to storage URLs.
- Evidence bucket names, object paths, digests, unmasked device identifiers,
  provider errors and private URLs never appear in customer UI or generic logs.
- An attachment URL is requested only when the customer chooses to open a
  file, is never persisted and is requested again after expiry.
- All private post-purchase reads and mutations preserve
  `Cache-Control: no-store`; route loaders, framework caches and client
  persistence must not cache the response.

### 3.4 Reliability and maintenance

- Generated DTOs are normalized once at the feature boundary; pages do not
  create parallel domain DTOs.
- Buttons and forms use the current server projection. A stale conflict causes
  an authoritative refetch instead of an optimistic merge or automatic retry.
- Shared post-purchase components live behind one owner import path and use CSS
  Modules plus existing tokens.
- Loading, empty, not-found, retryable provider error, conflict and success
  states are first-class design states.
- The frontend/design owner maintains presentation components; backend/docs
  authority continues to own business claims and transitions.

## 4. Scope

### 4.1 Routes

| Route | Customer purpose | Guest access |
| --- | --- | --- |
| `/orders` | Review all owned orders | No |
| `/orders/[orderNumber]` | Review one order and its lifecycle | Valid order ownership only |
| `/warranties` | Review all owned warranties | No |
| `/warranties/[warrantyCode]` | Review one warranty | Valid order ownership only |
| `/after-sales` | Review support requests | No |
| `/after-sales/new` | Create a support request | Valid order ownership only |
| `/after-sales/[requestNumber]` | Follow one support request | Valid order ownership only |

Customer labels use **Hỗ trợ sau mua** and **Yêu cầu hỗ trợ**. The route and
internal domain name remain unchanged.

### 4.2 Operation coverage

| Area | Operations |
| --- | --- |
| Orders | `listCustomerOrders`, `getCustomerOrder`, `cancelCustomerOrder` |
| Payment | `submitPaymentProof` |
| Warranty | `listCustomerWarranties`, `getCustomerWarranty` |
| Support after purchase | `listCustomerAfterSalesRequests`, `createAfterSalesRequest`, `getAfterSalesRequest`, `uploadAfterSalesAttachment`, `getAfterSalesAttachmentUrl`, `cancelAfterSalesRequest` |

FE-04 is complete only when all twelve operations have accepted UI coverage.

### 4.3 Explicit non-goals

- Guest order, warranty or support request collection pages.
- Backend state-machine, storage, payment, refund or warranty-policy changes.
- Staff workflow, internal checklist, staff identity or internal notes.
- Public file previews or permanently reusable evidence links.
- Ratings, loyalty, recommendations, promotional urgency or new policy claims.
- Dark mode, decorative motion or a new UI framework.

## 5. Information architecture

### 5.1 Portal frame

All seven routes share a `CustomerPostPurchaseFrame` built on the current
storefront shell:

1. FE-03 global two-tier header.
2. Local navigation inside page content, not a third sticky header:
   `Đơn hàng`, `Bảo hành`, `Hỗ trợ sau mua`.
3. Page title, supporting sentence and current status/action.
4. Route content.
5. Existing storefront footer when it naturally falls below the page content.

The global account menu stays unchanged: `Quản lý tài khoản`, `Bảo hành`,
`Ưa thích`, `Đơn hàng`. Support after purchase remains reachable from the
portal-local navigation and relevant contextual actions.

### 5.2 Component layers

```text
Route page/layout
  -> feature adapter (generated DTO -> presentation view model)
    -> post-purchase domain component
      -> existing UI primitive
```

Shared domain components:

- `CustomerPostPurchaseFrame`
- `PostPurchaseNavigation`
- `LifecycleJourney`
- `CurrentStepSummary`
- `AvailableActionPanel`
- `OrderList`
- `OrderProductSummary`
- `PaymentSummary`
- `ShipmentSummary`
- `RefundSummary`
- `WarrantyList` / `WarrantySummary`
- `SupportRequestList` / `SupportRequestSummary`
- `AttachmentList` / `AttachmentUploader`
- `ConfirmationDialog`
- shared collection loading/empty/error/pagination states

Names are implementation guidance, not a requirement to create generic
wrappers. Promote a component only when it is reused or owns meaningful state,
accessibility or lifecycle semantics.

## 6. Chosen visual direction

The approved direction is **Hành trình theo chặng**.

- Detail pages use a broad horizontal journey to show completed, current and
  future stages.
- The current stage uses text plus an icon; color alone is never the signal.
- Supporting information uses a balanced `7/5` or `8/4` layout on desktop.
- Collection pages use one grouped surface with row dividers instead of a grid
  of floating cards.
- Each screen has one obvious primary action and no more than one or two
  supporting actions in the primary viewport.
- Mobile replaces the wide journey with a compact current-step summary and
  stage progress; it does not squeeze desktop milestones into a narrow row.

Visual tokens remain those in `design.md`: canvas `#F7F9FB`, white surface,
deep ink, restrained teal `#007C9F`, thin borders, `8–10px` radius, minimal
elevation and Inter/system typography in customer readability mode.

## 7. Approved visual references

The images below lock hierarchy and presentation. Text and data inside them are
illustrative and never override runtime contracts.

| Screen | Reference |
| --- | --- |
| Orders list | [orders-list-desktop](../assets/ui/fe-04/orders-list-desktop.png) |
| Order detail | [order-detail-desktop](../assets/ui/fe-04/order-detail-desktop.png) |
| Warranties list | [warranties-list-desktop](../assets/ui/fe-04/warranties-list-desktop.png) |
| Warranty detail | [warranty-detail-desktop](../assets/ui/fe-04/warranty-detail-desktop.png) |
| Support list | [support-list-desktop](../assets/ui/fe-04/support-list-desktop.png) |
| Create support request | [support-new-desktop](../assets/ui/fe-04/support-new-desktop.png) |
| Support request detail | [support-detail-desktop](../assets/ui/fe-04/support-detail-desktop.png) |
| Representative mobile order detail | [order-detail-mobile](../assets/ui/fe-04/order-detail-mobile.png) |

### 7.1 Contract-mandated reference deltas

The references approve composition, density and hierarchy, not every sample
control or label. Implementation must apply the following deltas without asking
for a second visual decision:

| Reference element | Required implementation |
| --- | --- |
| Mockup global header | Reuse the live FE-03 header exactly. On mobile this is the current wordmark, cart and `Danh mục` treatment; do not trace the mockup header. |
| Product photographs in post-purchase rows/details | The twelve FE-04 responses expose no product media or slug. Use a neutral iPhone/accessory domain icon when type is known, otherwise a text-only summary. Do not issue catalog lookups or N+1 requests to recreate the pictures. |
| State-specific actions on an order-list row | `OrderListItemDto` has no `availableActions`, payment attempt or refund detail. Keep the row action `Xem chi tiết`; `Tra cứu vận đơn` may additionally appear only when the list projection supplies a validated safe tracking URL. |
| Warranty status filter and `Sắp hết hạn` hint | Remove both. The warranty collection supports only server page/page-size, and FE-04 does not invent a nearing-expiry threshold. Show projected validity/voided/not-started information only. |
| Top-level `Tạo yêu cầu mới` on the support collection | Replace with `Chọn sản phẩm từ đơn hàng`, linking to `/orders`. Open `/after-sales/new` only with an authoritative `orderNumber` and `orderItemId` context. |
| Straight-through support journey | Render the real branchable lifecycle. `REJECTED` and `CANCELLED` are terminal outcomes, never successful completed stages. |
| Mobile order label `4/4` | Use the actual stage position when the mapping is reliable (for the sample, `4/5`), or omit the denominator and announce the current stage. |
| Requested-outcome counter `/2000` | The optional requested outcome is limited to 500 characters; only the issue description uses 2,000. |
| Exchange/return promises | Use `Yêu cầu đổi sản phẩm` and `Yêu cầu trả sản phẩm`; do not promise a replacement model or refund before a decision exists. |
| Mixed-language product sample | Render `Cáp USB-C sang Lightning` in customer copy. |
| Sample warranty code `RPH-WR-...` | Use the backend warranty-code format, represented in fixtures as `RPH-W-...`. |

Any conflict between a reference image and generated API schema, requirements,
privacy rules or the live FE-03 shell is resolved in favor of those authorities.

## 8. Screen specifications

### 8.1 `/orders`

- Heading: `Đơn hàng của bạn`.
- Server-authoritative pagination, status/fulfillment filters and allowlisted
  sort (`placedAt`, `grandTotal`, `status`). URL query state contains only
  allowlisted filter, sort and page values so back/forward and deep links work.
- Grouped rows show a neutral domain icon or text summary, `firstItemName`,
  remaining item count, order number, ordered date, total and projected status.
- Every row has the generic action `Xem chi tiết`. It does not infer payment,
  refund or cancellation actions that are absent from `OrderListItemDto`.
- Loading keeps row geometry stable; empty state points back to available
  products; retry state preserves the filter and page.
- Guest access never renders the collection shell.

### 8.2 `/orders/[orderNumber]`

- Heading and status use the current order projection.
- A horizontal journey explains order, payment, pickup/shipping and terminal
  milestones without merging independent status axes into a fake single enum.
- Product, amount, payment, shipment, refund and warranty are separate snapshot
  groups beneath the journey.
- `Tra cứu vận đơn` appears only for a validated HTTPS tracking URL.
- `Hủy đơn` and `Nộp minh chứng thanh toán` render only when
  `availableActions` permits them. Destructive actions require confirmation;
  order cancellation requires a 5–500 character reason.
- Payment proof accepts one JPEG, PNG, WebP or PDF file for an eligible payment
  attempt. `REJECTED` is terminal and never offers resubmission.
- Mutations disable duplicate submission and refetch the entire detail after
  success, replay or stale conflict.

### 8.3 `/warranties`

- Grouped rows show a neutral domain icon or text summary, product, warranty
  code, `[startAt, endAt)` boundaries, projected status/validity and
  `Xem chi tiết`.
- Render `Đã vô hiệu` for `VOIDED`; otherwise render `Còn hiệu lực` when
  `isValid`, `Đã hết hạn` when `isExpired`, and `Chưa hiệu lực` when an active
  warranty has not reached `startAt`. Do not invent `Sắp hết hạn` or another
  persisted state.
- The collection supports server pagination only. Page is reflected in the URL;
  there is no status filter or client-side filtering of the current page.
- The collection is available only to a signed-in customer.

### 8.4 `/warranties/[warrantyCode]`

- A three-point validity journey shows start, current date and end boundary.
- Product snapshot, masked identifiers and recorded warranty information are
  grouped below.
- The journey has explicit not-started, active, expired and voided
  presentations. A voided warranty is shown as a terminal outcome rather than
  a completed validity period.
- `Yêu cầu hỗ trợ` is contextual navigation to
  `/after-sales/new?orderNumber=...&orderItemId=...`, using only the owning
  order/item values from the detail projection. It is not an eligibility claim;
  the create command remains authoritative.
- The page never exposes cost, raw identifiers, internal notes or staff data.

### 8.5 `/after-sales`

- Customer title: `Hỗ trợ sau mua`.
- Grouped rows show a neutral domain icon or text summary, product, request
  type, request number, latest public update, state and `Xem tiến độ`.
- The collection CTA is `Chọn sản phẩm từ đơn hàng` and opens `/orders`.
  `/after-sales/new` is entered only with the owning `orderNumber` and
  `orderItemId` selected from an order/warranty context.
- Type/status filters and pagination are server-authoritative and use
  allowlisted URL query state.

### 8.6 `/after-sales/new`

- A compact journey shows `Chọn sản phẩm -> Mô tả vấn đề -> Gửi yêu cầu`.
- The selected order item remains visible beside the form on desktop and above
  the form on mobile.
- Request choices are `Yêu cầu bảo hành`, `Yêu cầu đổi sản phẩm`, `Yêu cầu trả
  sản phẩm`; copy does not promise the resolution.
- Description guidance is 10–2,000 characters; the optional requested outcome
  is at most 500 characters and cannot be blank whitespace.
- Attachments are added after the request exists, not inside the create
  command.
- Eligibility errors return the customer to the authoritative product/request
  state with a safe explanation and preserved form text where safe.

### 8.7 `/after-sales/[requestNumber]`

- The normal branch is `REQUESTED -> RECEIVED -> INSPECTING -> APPROVED ->
  RESOLVED`. `REJECTED` branches from decision/inspection and `CANCELLED` is
  available only from `REQUESTED`; both render as terminal outcomes rather than
  successful completed milestones.
- Public issue, requested outcome, decision/resolution and public updates are
  shown without internal staff notes.
- Attachment rows use customer labels such as `Ảnh và tài liệu`; raw MIME types
  and storage details stay hidden.
- Upload is offered only for `REQUESTED`, `RECEIVED` or `INSPECTING` when the
  projected `UPLOAD_ATTACHMENT` action exists. Each upload HTTP request carries
  one JPEG/PNG/WebP/PDF file, with a 10 MiB per-file limit and at most five
  attachments on the support request.
- Cancel appears only while the request is cancellable and requires a 5–500
  character reason.
- Opening an attachment requests a fresh safe URL in response to the user
  action. The URL must contain no credentials and use HTTPS in production; HTTP
  is allowed only for loopback hosts in local/test environments. It opens with
  `noopener noreferrer`; a blocked popup or link failure is explained with a
  safe retry action.

## 9. Data flow and authoritative actions

### 9.1 Customer access

1. Route resolves identity and parameters.
2. Typed client requests the customer resource.
3. A feature adapter creates a narrow presentation model.
4. The current `AuthProvider` supplies the in-memory customer token to a narrow
   client orchestrator, while pure presenters render the resulting view model.
5. A mutation submits once, announces progress, then refetches the projection.

### 9.2 Guest access

1. Order detail receives the guest order credential from the approved browser
   handoff.
2. The credential is removed from the visible URL and kept only for the current
   browser session, scoped by order number.
3. Detail and mutation adapters attach it using the existing transport helper.
4. Warranty and support links preserve the owning `orderNumber` context without
   placing the credential in a URL.
5. Invalid, missing or wrong-owner credentials render the same safe not-found
   result.

The customer UI never explains these transport details.

### 9.3 Role and ownership matrix

| Caller | Collection routes | Owned detail/mutation | Non-owned or invalid detail | Credential rule |
| --- | --- | --- | --- | --- |
| Anonymous, no guest credential | Sign-in state; no customer data | Safe not-found/auth entry as specified by the route | Same safe state | Never create a placeholder credential |
| Guest with valid order credential | Never allowed | Only resources belonging to that order | Safe not-found | Order-scoped session credential or converted-cart cookie |
| Guest with invalid order token or expired converted-cart credential | Never allowed | Safe not-found | Same safe not-found | Remove unusable session entry when applicable; do not reveal cause |
| Signed-in `CUSTOMER`, owner | Owned collections | Allowed by resource projection | Safe not-found | Bearer identity is authoritative |
| Signed-in `CUSTOMER`, non-owner | Owned collections only | Safe not-found | Same safe not-found | Never fall back to a guest credential for another order |
| Signed-in `EMPLOYEE` or `ADMIN` | `403` on customer routes | `403` | `403`; never guest fallback | Bearer role takes precedence |

### 9.4 Action authority

- Order cancel and payment-proof submission follow `availableActions`.
- Support-request upload/cancel follows the public request projection.
- Warranty validity uses `[startAt, endAt)` and does not persist a synthetic
  `EXPIRED` state.
- Warranty-to-support navigation carries only the owning order/item context;
  it is not a promise of eligibility. The create command is the final authority
  for active warranty, completed order and duplicate-open-case rules.
- The frontend does not derive terminal transitions, amounts, deadlines or
  refund outcomes.

### 9.5 Replay and conflict handling

- Cancelling an already-cancelled order accepts the returned current projection
  when the backend treats it as a replay.
- Repeating proof submission while the payment is `UNDER_REVIEW` accepts the
  `200` projection and removes the action. A `REJECTED`, verified, expired or
  otherwise terminal payment returns/handles `409`; FE-04 does not offer a
  resubmit action.
- Repeating support cancellation succeeds only when it repeats the same reason.
  A different reason or another terminal transition is a `409` and triggers an
  authoritative refetch.
- FE-04 never automatically retries a mutation after a transport ambiguity;
  the refetched projection determines the next customer action.

## 10. State and error design

Every route designs the states that can occur:

- initial loading and refetching;
- empty collection;
- safe not-found / ownership mismatch;
- validation error with focus on the error summary and linked field;
- stale conflict with authoritative refresh;
- already-processed replay;
- rate limit with retry guidance;
- provider/storage unavailable with preserved safe input;
- attachment too large, unsupported or over the request limit;
- expired attachment link with a one-click fresh-link retry;
- browser-blocked attachment window or unsafe returned URL;
- terminal resource with actions removed from the new projection.

Customer copy describes the result and next action. It never prints provider
messages, endpoint names, exception text or internal codes.

## 11. Responsive and accessibility

- Validate `320`, `390`, `768`, `1024` and `1440px`, plus 200% zoom.
- Mobile uses a single column and full-width primary actions.
- Portal-local navigation may scroll horizontally but each target remains at
  least `44px` high and exposes the current route with `aria-current="page"`.
- Wide journeys become a compact current-step summary on mobile.
- Desktop lifecycle journeys are ordered lists; the current milestone uses
  `aria-current="step"`. The mobile summary has an accessible label announcing
  the stage without relying on the visual fraction.
- One `h1`; heading order, landmarks and labels remain semantic.
- Keyboard users can complete cancel, payment proof, create request, upload and
  file-open flows.
- Async status uses an appropriate live region; the error summary receives
  focus; each field error is programmatically linked to its field.
- Confirmation dialogs have an accessible name, trap focus, close on `Escape`
  when safe and return focus to the trigger.
- Reduced motion removes non-essential transitions.
- Status never relies on color alone and normal text meets WCAG 2.2 AA
  contrast.
- At 200% zoom, controls and content reflow without two-dimensional scrolling
  except for the intentionally horizontal local-navigation strip.

## 12. Test strategy

### 12.1 Operation-to-test matrix

| Operation | Fixture / path | Primary assertions |
| --- | --- | --- |
| `listCustomerOrders` | Customer with multiple fulfillment/status pages | Allowlisted URL filter/sort/page mapping; generic row action; no guest list or inferred actions |
| `getCustomerOrder` | Owner, non-owner, valid guest and invalid guest | Correct snapshots/journey; owner and credential boundaries; identical safe not-found DOM for invalid/non-owner |
| `cancelCustomerOrder` | Customer/guest cancellable order plus terminal replay | 5–500 reason, confirmation/focus, duplicate-submit lock, replay projection, different stale transition refetch |
| `submitPaymentProof` | Guest awaiting-proof payment; under-review and rejected payments | Multipart JPEG/PDF, ownership/CSRF headers by credential mode, `UNDER_REVIEW` replay `200`, terminal `409`, no rejected resubmit |
| `listCustomerWarranties` | Customer with not-started, active, expired and voided warranties | Page-only URL state, `[start,end)` copy, no status filter/`Sắp hết hạn`, no guest collection |
| `getCustomerWarranty` | Customer/guest owner plus invalid ownership | Not-started/active/expired/voided journey, masked data only, order/item context on support navigation, safe not-found parity |
| `listCustomerAfterSalesRequests` | Customer with each public type/status | Server type/status/page URL mapping, branch-safe labels, collection CTA routes to `/orders` |
| `createAfterSalesRequest` | Completed order item; inactive warranty; duplicate open case | Exact order/item context, 10–2,000 and optional <=500 validation, neutral exchange/return copy, safe eligibility errors |
| `getAfterSalesRequest` | Open, rejected, resolved and cancelled owner/guest cases | Branchable journey, public fields only, available-action rendering, no staff/internal data |
| `uploadAfterSalesAttachment` | REQUESTED/RECEIVED/INSPECTING and terminal request | One file/upload, type/size/five-count checks, `413`/`415`/`429`/`503`, duplicate-submit lock, refetch conflict |
| `getAfterSalesAttachmentUrl` | Owned attachment with fresh/expired/unsafe URL | User-initiated fetch, HTTPS/no-credentials validation, no persistence, expiry refetch, popup-blocked recovery |
| `cancelAfterSalesRequest` | REQUESTED plus same/different-reason replay | 5–500 reason, same-reason replay succeeds, different reason `409`, action removed after refetch |

### 12.2 Unit, adapter and component coverage

- Order list/get/cancel adapters, warranty adapters and support adapters map
  generated DTOs without creating parallel business types.
- Unknown/future status values fall back to a safe neutral label and never show
  an action or successful terminal milestone.
- API adapter tests cover multipart proof/upload, Bearer-versus-guest
  precedence, guest header, exact-Origin cookie mutation and
  `X-Rephone-CSRF: 1` behavior.
- Response-policy tests preserve `Cache-Control: no-store` and prove no private
  read/mutation enters framework or persistent client caches.
- Journey tests cover ordered semantics, `aria-current`, every support branch
  and not-started/active/expired/voided warranty presentation.
- Component tests cover action absence/presence, dialog naming/focus/Escape/
  return-focus, linked field errors, duplicate submission, upload limits,
  conflict refetch and live announcements.
- Query-state tests allowlist supported values, preserve back/forward/deep
  links, use order/support filters plus pagination and warranty pagination only.
- URL safety tests reject credentials, unsafe protocols and non-HTTPS
  non-loopback tracking/attachment URLs; loopback HTTP is accepted only in the
  local/test environment.

### 12.3 Browser, security and visual coverage

- Run the role/ownership matrix for anonymous, valid/invalid guest order token,
  expired converted-cart credential, owner/non-owner customer and
  employee/admin Bearer callers. Explicitly test a signed-in customer carrying
  a guest credential for another order: Bearer wins and no guest credential is
  sent.
- Verify guest fragment handoff, visible-URL removal, refresh and order-scoped
  session access. Assert the credential is absent from final URL, HTML,
  `localStorage`, analytics and captured application logs.
- Assert invalid guest and wrong-owner states have the same safe DOM and never
  expose raw identifiers, bucket/path/digest, staff notes or provider details.
- Assert attachment links are not stored, expire/refetch correctly, and are not
  requested before a user action; cover blocked-window and `429` recovery.
- Run keyboard-only, Axe, reduced-motion and 200%-zoom checks. Include desktop
  and mobile collection/detail screenshots at the locked viewports, plus the
  destructive confirmation and safe error state.

### 12.4 Seed and evidence discipline

- A Playwright setup project or application-API fixture creates each scenario
  after the API is ready; fixtures are idempotent/resettable and never depend on
  execution order.
- Each scenario owns a distinct account, order and inventory unit. Do not reuse
  the existing `critical-commerce-flow` fixture or `IP13-BLU-001`.
- Minimum fixtures: guest order awaiting proof, customer cancellable order,
  completed order with not-started/active/voided warranty variants, and support
  requests with attachment plus each terminal branch.
- Create mutable business state through application commands rather than
  directly assigning terminal database values. Because the current
  `WarrantyClock` uses real time and exposes no command for an expired warranty,
  cover the expired boundary with a deterministic adapter/component response
  fixture. Add browser coverage only if the test server gains an explicit clock
  override; do not mutate warranty dates directly in the database.
- Record command, viewport, fixture identifier, screenshot/a11y location and
  result for every release-gate assertion. Record representative performance
  measurements as evidence; if no repeatable harness exists, record the debt
  instead of claiming the target passed.

## 13. Implementation sequence

1. Merge the approved FE-03 branch into `main`.
2. Create `feat/fe-4-customer-post-purchase` from the updated `main`.
3. Mark FE-04 `IN PROGRESS` in the top status, phase table, updated date and
   status log of `plan-fe.md`. In `frontend-coverage.ts`, change only
   `FRONTEND_PHASE_STATUS['FE-4']`; leave all twelve operation entries
   `NOT STARTED` until their implementation package begins. Change this design
   record's implementation status to `In progress` in the same setup commit.
4. Build the portal frame, local navigation, presenters and shared lifecycle /
   collection states.
5. Deliver `feat(web): redesign customer orders`.
6. Deliver `feat(web): unify warranty and after-sales portal`.
7. Add the dedicated customer post-purchase browser suite and visual/a11y
   evidence.
8. Update each operation ledger/manifest entry only with its completed package.
9. Mark all twelve operations and FE-04 `DONE` only after checkpoint C4 passes;
   record the final SHA, test commands, screenshots, accessibility/NFR evidence
   and `FE-05 next` in the phase closeout.

## 14. Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| Guest access breaks during navigation refactor | Keep existing order-access helper; add fragment/session/header browser coverage before page migration |
| Private evidence data leaks | Use existing adapters; never render/log object metadata; request a fresh URL only on open |
| UI infers invalid actions | Centralize `AvailableActionPanel`; refetch after mutations/conflicts; test action absence |
| Seven monolithic client pages remain difficult to maintain | Split orchestration, adapter, domain component and leaf interaction layers incrementally |
| Global header/CSS regression affects FE-01–03 | Reuse FE-03 header unchanged; isolate portal styles in CSS Modules; run storefront regression snapshots |
| Demo data makes browser tests order-dependent | Create scenario-specific fixtures through application commands |
| Mockup product images cause catalog N+1 or broken placeholders | Use neutral domain icons/text from the FE-04 projection; no catalog enrichment in this phase |
| Support CTA lacks required order/item context | Route the collection CTA to `/orders`; create only from an owning order/warranty context |
| Future backend status renders as a successful milestone | Use a neutral unknown-state fallback with no actions and log only a sanitized diagnostic |
| Mockup header drifts from the shipped storefront shell | Treat references as page-hierarchy evidence and reuse the live FE-03 header implementation |

## 15. Decision log

| ID | Decision | Alternatives considered | Reason |
| --- | --- | --- | --- |
| D01 | Cover all seven routes and twelve operations in FE-04 | Partial order-only phase | Avoid a half-redesigned customer portal and satisfy checkpoint C4 |
| D02 | Use natural Vietnamese and hide implementation/security terms from customers | Preserve current technical copy | Customer needs outcomes and actions, not transport details |
| D03 | Keep backend contracts unchanged | Add new FE-specific backend projection | Reduce regression and use the implemented source of authority |
| D04 | Merge FE-03 into `main` before creating the FE-04 branch | Branch FE-04 directly from FE-03; dependent sub-branches | Keep history and review boundaries clear |
| D05 | Build a shared portal foundation before route redesign | Patch seven pages separately; split two dependent branches | Reduce repeated state/error logic and visual drift |
| D06 | Choose **Hành trình theo chặng** | Vertical journey; action-first status band | The horizontal lifecycle is easiest to scan on dense detail pages and adapts to a compact mobile summary |
| D07 | Put portal navigation inside page content | Add a third sticky header; expose every portal route in the global header | Preserve the approved FE-03 header and keep the portal coherent |
| D08 | Use grouped rows for collections | Individual floating cards; dense data tables | Better scan alignment without a backoffice aesthetic or card soup |
| D09 | Keep detail actions authoritative and refetch after mutation/conflict | Infer actions from status; optimistic terminal transition | Prevent stale or invalid customer actions |
| D10 | Make attachment access private and user-initiated | Persist preview URLs; expose storage metadata | Preserve evidence privacy and tolerate short link expiry |
| D11 | Start support creation from an owning order/warranty item; collection CTA returns to `/orders` | Link directly to empty `/after-sales/new`; infer eligibility from order status | The create route requires `orderNumber` and `orderItemId`, while the existing order action projection has no create-support primitive |
| D12 | Treat mockup media as illustrative and use domain icons/text | Fetch catalog detail per post-purchase row; add a backend field inside FE-04 | Current DTOs expose no media/slug and N+1 enrichment violates the performance boundary |
| D13 | Persist allowlisted collection state in the URL | Component-only filter state; persist all raw query values | Back/forward, refresh and deep links remain useful without allowing arbitrary input |
| D14 | Remove warranty filtering and nearing-expiry hints | Filter one client page; invent a `Sắp hết hạn` threshold | The list contract supports only pagination and no threshold is product-authoritative |

## 16. Acceptance criteria

- Seven routes conform to the approved references and current design tokens.
- Contract-mandated reference deltas in section 7.1 are applied, including the
  live FE-03 header and neutral no-media product treatment.
- Twelve operations have visible, tested UI coverage.
- The complete role/ownership matrix passes, including Bearer precedence over a
  guest credential for another order.
- No guest list data, private bucket/path/digest, unmasked device identifier,
  staff-only notes or permanent evidence URL reaches customer output. Necessary
  opaque route keys such as `orderItemId` are never displayed as customer copy.
- Collection pagination, empty/loading/error and retry states are implemented.
- Orders/support filters and page state survive refresh/back/deep link;
  warranties use page state only.
- Detail journeys show current and next steps without inventing business state.
- Destructive actions confirm, prevent duplicate submission and refetch the
  authoritative resource.
- Rejected payment proof is terminal; support rejected/cancelled branches never
  appear as successful completed stages.
- Attachment upload enforces one file per upload, five per request, supported
  formats and size; attachment/tracking URLs pass safe-protocol/credential checks
  and signed links are never persisted.
- Customer-facing copy is natural Vietnamese and contains no implementation
  terminology.
- Browser flows pass at locked desktop/mobile viewports, keyboard-only, 200%
  zoom, reduced motion and Axe without serious/critical violations.
- Representative performance measurements or an explicit harness debt record
  accompany the closeout; unmeasured targets are not reported as passing.
- FE-01–03 storefront/header regression checks remain green.

## 17. Rollback

- Route presentation can be rolled back independently while retaining typed
  adapters, ownership helpers and API contracts.
- Do not roll back through backend business-state changes.
- Keep the legacy page available only during migration; remove compatibility
  wrappers after the last route and regression suite pass.
