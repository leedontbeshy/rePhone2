# Design QA — iPhone facts, accessory cards, typography, and customer navigation

Date: 2026-08-27

Preview: `http://localhost:3000/products/iphone-15-pro`

## Sources and implementation

- User reference — complete iPhone 13 detail: `C:\Users\Lee\AppData\Local\Temp\codex-clipboard-d013e1d3-11b7-4da9-8033-56db77dd790b.png` (1079×580).
- User reference — sparse iPhone 15 Pro detail: `C:\Users\Lee\AppData\Local\Temp\codex-clipboard-5d61fa42-6ca4-44d5-920e-44b7348e43b0.png` (1098×603).
- User reference — uneven accessory cards: `C:\Users\Lee\AppData\Local\Temp\codex-clipboard-100a8c46-b054-4fe9-9cbe-a5211bff526c.png` (940×539).
- Canonical repository reference: `D:\Dev\rePhone2\docs\assets\ui\rephone-model-detail-canonical-reference.png` (1006×1563).
- Final implementation captures:
  - `C:\Users\Lee\AppData\Local\Temp\rephone-final-iphone-15-pro.png` (1265×712).
  - `C:\Users\Lee\AppData\Local\Temp\rephone-final-iphone-15-pro-mid.png` (1265×712).
  - `C:\Users\Lee\AppData\Local\Temp\rephone-final-accessory-cards.png` (1265×712).
- Main implementation: `apps/web/components/catalog/iphone-model-detail.tsx`, `apps/web/lib/iphone-model-facts.ts`, `apps/web/components/catalog/catalog.module.css`, and `apps/web/components/storefront/`.

## Viewport and state

- In-app Browser production preview, authenticated CUSTOMER session.
- CSS viewport: 1280×720; document client width: 1265; device pixel ratio: 2.
- Captured states: model hero, model colors/trust/list heading, accessory card row, account header, store header, and the Wishlist navigation interaction.
- Anonymous state was checked before authentication; role unit tests also assert that the customer shortcuts are absent for anonymous/loading/EMPLOYEE/ADMIN sessions.
- The in-app Browser viewport override did not alter the rendered viewport for 390px emulation. Responsive behavior was therefore inspected in source and covered with browser assertions at 320×568, 390×844, 1024×900, and 1440×900. The mobile drawer now has bounded height, its own scrolling, and a dynamic focus trap.

## Full-view comparison

- The repository canonical reference and the final page retain the same page hierarchy: shared header, breadcrumbs, two-column model hero, four core facts, trust note, available-unit grid, and footer.
- The user-requested differences are present: source-backed colors, customer-friendly trust copy, the single heading `Các máy đang có sẵn`, and larger customer typography.
- The Browser full-page stitch duplicated part of the fourth card and footer, while the live DOM contained exactly four `Xem máy này` actions, one availability heading, and one footer. Full-page stitching was not used as visual evidence; the complete page was instead checked through consecutive focused captures plus DOM geometry.

## Focused comparisons

### Model detail

- Compared the iPhone 15 Pro source and final hero in the same visual input.
- The image/summary split, model label, title weight, card radius, borders, and teal accent stay aligned with the existing design language.
- The sparse one-card state is replaced by four balanced cards: year, chip, RAM, and display. The colors panel and trust note continue the same card treatment.
- No clipping, horizontal overflow, missing imagery, or Next.js error overlay was present.

### Accessory cards

- Compared the supplied accessory source and final card row in the same visual input.
- All three card bottoms and CTA bottoms are equal in the live geometry. Optional color text consumes natural body space; no fake placeholder content was added.
- The test now compares cards within each grid row, so future multi-row catalogs do not produce a false failure.

### Header and customer states

- At 1280px, both the public catalog list and the customer shortcut row had center x = 632.5px; document horizontal overflow was 0.
- Authenticated CUSTOMER header exposes `Bảo hành`, `Ưa thích`, and `Đơn hàng`. The Wishlist link navigated to `/wishlist` and rendered `Sản phẩm đã lưu`.
- Account sidebar links resolve to 15px. Auth descriptions and legacy customer mobile navigation use the increased customer typography without changing backoffice sizing.

## Mandatory surface review

- Typography: customer storefront/account/auth text increased slightly; hierarchy remains readable and consistent.
- Spacing and alignment: header rows centered; model facts use a stable 2×2 grid; accessory cards and actions align per row.
- Color and contrast: existing navy/teal/neutral token system preserved; no new unverified palette introduced.
- Images: existing product assets retained with correct aspect ratio and no stretching.
- Copy and localization: customer copy is natural Vietnamese; no access-token/session/cookie/localStorage/checklist wording appears on the checked customer surface.
- Icons and controls: existing Phosphor icon family retained; navigation, Wishlist link, sort control, and visible CTAs remain operable.
- Responsive/accessibility: no desktop overflow; short mobile drawer scrolls independently; focusables are recomputed while session state changes; focus remains trapped in the dialog.
- Runtime: clean Browser tab reported zero console errors and zero console warnings after model, accessory, account, Wishlist, and store interactions.

## Comparison and fix history

1. P1 — account pages initially omitted the new shortcut row. Fixed by letting `CustomerShell` accept the shared primary navigation and wiring it through `AccountShell`; post-fix DOM confirms all three links.
2. P1 — authenticated mobile drawer could exceed a short viewport while body scrolling was locked. Added `max-height: 100dvh`, `overflow-y: auto`, overscroll containment, and a 320×568 assertion.
3. P1/P2 — several finish names did not match Apple Vietnamese terminology. Corrected the iPhone 17 family, iPhone 13 Pro family, iPhone 11 Pro family, and iPhone 5 finishes; added regression assertions.
4. P2 — mobile focusables were captured before asynchronous session changes. The focus trap now recomputes them on every Tab key and recovers focus if the active node disappears.
5. P2 — the first final preview exposed an illegal browser-fetch replay invocation after session refresh. The API client now invokes replay fetch with the global browser context; a regression test was added. A clean rebuilt preview has no console errors.
6. P2 — the accessory geometry test compared different future rows globally. It now groups cards by visual row before comparing bottoms.

No P0, P1, or P2 findings remain.

final result: passed
