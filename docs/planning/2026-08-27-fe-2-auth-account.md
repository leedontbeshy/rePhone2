# FE-2 — Auth & self-service account implementation record

> Trạng thái: **IN PROGRESS**<br>
> Branch: `feat/fe-2-auth-account`  
> Start baseline SHA: `6a98db7`  
> FE-1 closeout SHA: `aae6f12`  
> Ngày bắt đầu: `2026-08-27`  
> Design authority: [design.md](../../design.md)  
> Delivery plan: [plan-fe.md](../../plan-fe.md)

## 1. Understanding lock

Yêu cầu triển khai và các contract `APPROVED` đã xác nhận:

- FE-2 sở hữu năm route auth hiện có `/login`, `/register`, `/forgot-password`, `/reset-password`, `/accept-invitation` và ba route mới `/account`, `/account/addresses`, `/account/security`.
- Mười bốn operation thuộc phase là bảy auth operation và bảy account operation trong executable coverage manifest.
- Access token chỉ tồn tại trong memory; refresh token chỉ ở cookie `HttpOnly`; refresh/logout giữ nguyên Origin/CSRF contract và single-flight refresh hiện hành.
- Reset-password và invitation token đi từ fragment vào memory, fragment phải được xóa trước request; token không được vào query, SSR HTML, Web Storage, analytics hoặc log.
- `GET/PATCH /account` và `POST /account/change-password` dùng cho mọi user đã xác thực theo API contract; chỉ address collection bị giới hạn cho `CUSTOMER`.
- Address API trả mảng active address không pagination; archive là `DELETE` không request body, vì vậy UI không tự tạo filter/pagination contract hoặc reason field.
- Backend tiếp tục là authority cho account status, role, ownership, default-address transition, session revocation, validation và error code.
- Không đổi public URL, API, OpenAPI, database, role model, password policy hoặc session semantics trong phase này.

Không còn open question làm thay đổi scope. Yêu cầu “triển khai tiếp FE-2 trên nhánh mới” là xác nhận bắt đầu implementation theo design và contract đã duyệt.

## 2. Assumptions và non-functional requirements

- Quy mô giữ 20–50 người dùng đồng thời trên seeded/demo-scale data; address collection nhỏ và được đọc nguyên mảng theo contract.
- Protected account route hydrate rồi khôi phục session qua `AuthProvider`; không thêm BFF hoặc đưa refresh token cho JavaScript để SSR protected data.
- `AuthProvider` và generated client hiện hành là runtime foundation; phase này chỉ harden boundary cần thiết, không viết auth stack song song.
- Register không auto-login; forgot-password luôn giữ anti-enumeration response; change/reset password revoke session theo authoritative response.
- Contact/address data không được đưa vào telemetry, generic error dump, DOM data attribute hoặc persistent client cache.
- WCAG 2.2 AA, keyboard-only, focus-on-error/focus-return, touch target 44 px, zoom 200%, reduced motion và viewport 320/390/768/1024/1440 px là acceptance bắt buộc.
- Mục tiêu representative mobile giữ LCP ≤ 2,5 giây, CLS ≤ 0,1 và INP ≤ 200 ms trên seeded/test environment.
- Mỗi work package giữ compatibility path và concern-scoped rollback; không rewrite `globals.css` hoặc trộn backend/data change vào FE-2.

## 3. Phương án và quyết định

| Phương án | Đánh giá | Quyết định |
|---|---|---|
| Route group riêng cho auth/account, tái dùng `AuthProvider`, shell và primitive FE-0/FE-1 | Giữ URL, transport và blast radius ổn định; cho phép migrate tăng dần theo surface | **Chọn** |
| Chỉ restyle năm auth page tại chỗ và bọc shell lặp lại | Ít route move ban đầu nhưng account navigation, error semantics và responsive behavior dễ drift | Không chọn |
| Viết một client-only auth/account application và thay `AuthProvider` | State tập trung nhưng tăng JS, mở rộng security blast radius và vi phạm migration/rollback contract | Loại |

### Decision log

1. Migrate auth/account theo route group mà không đổi URL; giữ legacy route/component đến khi checkpoint C2 xanh.
2. Tái dùng `AuthProvider`, memory access token, refresh cookie và generated client; không tạo DTO hoặc token store song song.
3. Auth shell tối giản và không render backoffice/commercial navigation trong reset/invitation flow.
4. Profile và security capability theo API cho `CUSTOMER`, `EMPLOYEE`, `ADMIN`; account navigation chỉ hiện address entry cho `CUSTOMER`.
5. Chuẩn hóa ledger drift: ba account-level operation dùng `Authenticated Bearer`, bốn address operation giữ `CUSTOMER Bearer`.
6. `listAccountAddresses` render collection hiện hành, loading/empty/error; không thêm query, filter, pagination hay pagination UI không có trong OpenAPI.
7. Archive address dùng destructive confirmation nhưng không hỏi/gửi reason; sau mutation phải refetch authoritative collection.
8. Create/update `isDefault=true` dùng server transition; archive default không tự chọn default thay thế trong client.
9. Reset/invitation fragment được consume và clear trước request; invalid/expired/replayed token dùng cùng safe error presentation.
10. Change-password success xóa auth state, tôn trọng refresh-cookie clear từ server và chuyển về login; không giả lập session còn active.

## 4. Component và data boundary

```text
app/(auth)/layout
  → AuthShell
  → auth route orchestration
      → generated auth client
      → focused client form

app/(account)/layout
  → authenticated account boundary
      → StorefrontHeader + account sub-navigation
      → account route orchestration
          → generated account client + narrow presenter
          → profile/address/security client island

AuthProvider
  → memory-only access token
  → single-flight refresh + one replay
  → role-aware session navigation/logout
```

Component groups:

- `components/auth`: auth shell content, login/register/forgot/reset/invitation form và one-time-token boundary.
- `components/account`: account frame/navigation, profile form, address collection/card/editor/archive dialog và security form.
- `components/storefront`: session-aware header action tiếp tục là shared navigation owner; không copy header vào account route.
- Feature adapter chỉ chuyển generated DTO/error thành presentation state hẹp; role, ownership, status, default transition và session validity không được suy diễn ở component.
- Sensitive form state chỉ sống trong client island cần thiết và được clear khi success, unmount hoặc session change.

## 5. Work packages và commit strategy

| WP | Nội dung | Commit |
|---|---|---|
| 0 | Implementation record, phase status, contract-drift normalization và executable coverage lifecycle | `docs(fe): start auth account phase` |
| 1 | Auth runtime hardening, session-aware header và shared auth/account boundaries | `feat(web): harden authenticated application shell` |
| 2 | Login, register và forgot-password trong auth shell | `feat(web): redesign authentication` |
| 3 | Reset-password và invitation fragment-token flows | `feat(web): secure one-time authentication flows` |
| 4 | Account shell, role-aware navigation và profile self-service | `feat(web): add account profile` |
| 5 | Address collection, create/edit/default/archive workflow | `feat(web): add account addresses` |
| 6 | Change-password, logout và session-revocation presentation | `feat(web): add account security` |
| 7 | Unit/component/security/a11y/browser/visual coverage cho 14 operation | `test(web): cover auth account flows` |
| 8 | Full gates, rollback rehearsal, evidence và chuyển FE-3 thành next step | `docs(fe): mark auth account complete` |

Mỗi commit chỉ stage concern liên quan; không stage file do người dùng/agent khác thay đổi và không trộn cleanup legacy ngoài surface FE-2.

## 6. Test matrix

- Unit/component: auth/account presenter, safe error mapping, form dirty/pending/success, role-aware navigation, address default/archive state và focus-on-error.
- Auth provider: bootstrap refresh, single-flight concurrent refresh, replay tối đa một lần, anonymous fallback, logout và không refresh loop.
- Token security: access token không vào Web Storage/log; reset/invitation fragment consume+clear; raw token không vào query, SSR HTML, DOM attribute hoặc screenshot artifact.
- Cookie/CSRF: refresh/logout gửi credentials và custom CSRF header đúng contract; provider/401/403/429 được trình bày an toàn.
- Browser anonymous: register → login riêng; login failure; forgot-password anti-enumeration; reset/invitation valid, invalid, expired và replayed token.
- Browser authenticated: session-aware header, profile read/update, CUSTOMER address create/edit/default/archive, change-password → yêu cầu login lại, logout.
- Authorization: profile/security cho authenticated roles theo API; address entry/action chỉ CUSTOMER; ownership not-found không lộ resource.
- Accessibility: label/error summary/live region, keyboard-only, focus trap/Escape/focus return, target 44 px và axe không có serious/critical finding.
- Responsive/visual: representative auth/account state ở 320, 390, 768, 1024 và 1440 px; zoom 200% không overflow hoặc che focus.
- Regression: storefront FE-1, cart/checkout hiện hành, guest cookie/CSRF và backoffice entry không đổi behavior ngoài session-aware navigation đã duyệt.

## 7. Rollback

- Revert theo thứ tự security → addresses → profile/account shell → one-time auth → login/register/forgot → shared boundary.
- Giữ `AuthProvider`, cookie/CSRF transport, legacy auth pages và compatibility header cho tới khi C2 đạt; route group revert không được đổi public URL.
- Không rollback database hoặc sửa session bằng SQL. Session đã revoke do logout/change/reset password là business state đã commit và không được khôi phục bằng UI rollback.
- Ledger drift normalization phản ánh docs/OpenAPI và được giữ lại nếu rollback presentation.

## 8. Nguồn contract

- [Auth và account endpoints](../api/auth-and-account-endpoints.md)
- [Auth token transport](../api/auth-token-transport.md)
- [API error catalog](../api/error-catalog.md)
- [Authentication và security](../architecture/authentication-and-security.md)
- [Roles và permissions](../requirements/roles-and-permissions.md)
- [Identity/Auth data dictionary](../data-model/identity-auth.md)
- [Slice 02 auth/account design](2026-08-20-slice-02-auth-account-design.md)
- [Testing strategy](../quality/testing-strategy.md)
- [Seed và demo scenarios](seed-and-demo-scenarios.md)

Khi có drift, thứ tự authority là docs domain/security → OpenAPI/generated client → `design.md` → `plan-fe.md` → implementation. Hai drift đã biết trong WP0 là actor của account-level operation và shape/action của address collection/archive; WP0 chỉ đồng bộ ledger/manifest, không đổi API.

## 9. Nghiệm thu và evidence

- WP0: implementation record đã tạo; FE-2 chuyển `IN PROGRESS` đồng thời trong `plan-fe.md` và executable manifest; 14 operation vẫn `NOT STARTED` cho đến khi có UI/test evidence.
- WP0 contract normalization: account profile/security ghi actor authenticated; address list không pagination; archive không reason.
- Code evidence: chưa có — bổ sung commit/release SHA theo từng work package.
- Test evidence: chưa có — bổ sung command, exit status, browser trace và accessibility result.
- Visual evidence: chưa có — bổ sung representative desktop/tablet/mobile snapshots.
- Rollback rehearsal: chưa chạy — bổ sung sau khi auth/account route-group và shared state ổn định.

FE-2 chỉ chuyển `DONE` khi 14/14 operation có UI/action và automated evidence, browser flow desktop/mobile xanh, security assertions không lộ token/contact/address, full release gate xanh và rollback rehearsal được ghi lại.
