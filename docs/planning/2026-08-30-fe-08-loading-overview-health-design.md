# FE-08 — Loading UX, operations overview, and detailed health

Status: approved on 2026-08-30.

## Context

The FE-08 administration workspace is functional, but several transitions still make an already-loaded list appear to reload when only a detail panel changes. The shared backoffice sidebar also loses its vertical position between workspace routes. `/backoffice` is still a permanent skeleton, the health page only projects the two public probes, and the stock movement reference field does not align with adjacent controls.

## Approved outcomes

- A detail selection never invalidates its master list.
- Skeletons are reserved for the first useful load. Background refreshes keep the last successful projection visible and announce local progress.
- Mutations disable only the affected command or row, patch the local projection, and revalidate without blanking the workspace.
- The desktop sidebar restores its vertical position and ensures the current route is visible. Mobile keeps the existing horizontal centering behavior.
- `/backoffice` becomes a real operations overview backed by one aggregate endpoint and authoritative database data.
- The public `/health/live` and `/health/ready` responses remain minimal. A separate admin-only endpoint provides safe component-level diagnostics.
- The stock movement reference field aligns with the other fields while preserving its explanatory hint.

## Loading state model

Backoffice workspaces use four distinct states:

1. `initialLoading`: no useful projection exists yet; show a stable skeleton in the affected region.
2. `listUpdating`: a filter, page, sort, or background revalidation is running; keep rows interactive and show a compact progress message in the list header.
3. `detailLoading`: only the selected detail panel shows a loading placeholder.
4. `mutationPending`: disable the authoritative command being submitted; do not lock unrelated rows or navigation.

Errors during background revalidation preserve the last successful projection and explain that it may be stale. A full error state is used only when no successful projection exists. Request sequencing or cancellation prevents older responses from replacing a newer query.

Audit-log selection moves to `?selected=<id>` on the same route. The legacy `/backoffice/audit-logs/[id]` route redirects to the canonical query URL. Warranty-policy list identity excludes the `policy` selection parameter.

## Sidebar behavior

`BackofficeShell` owns both scroll axes:

- the `aside` element owns desktop vertical scroll;
- the inner `nav` retains mobile horizontal centering;
- the vertical position is persisted in `sessionStorage`;
- after navigation, the current item is moved only when it is outside the visible sidebar viewport;
- restoration occurs before paint where the browser permits, avoiding a visible jump.

## Detailed system health

`GET /api/v1/backoffice/system/health` is restricted to `ADMIN`, returns `Cache-Control: no-store`, and runs independent probes in parallel with bounded timeouts.

Safe response fields:

- overall status and observation time;
- total response duration;
- API status, rounded uptime, and probe duration;
- database connectivity and query duration;
- applied and incomplete migration counts;
- Supabase Storage status and duration from a read-only bucket-list probe;
- SMTP status and duration from transport verification without sending mail;
- stable reason codes such as `TIMEOUT`, `UNAVAILABLE`, or `NOT_CONFIGURED`.

The endpoint never returns provider URLs, project references, bucket names, SMTP hosts or users, keys, connection strings, environment values, SQL errors, stack traces, internal addresses, or customer data. Storage or SMTP failure degrades the detailed snapshot but does not alter the public readiness contract.

## Operations overview

`GET /api/v1/backoffice/overview` is available to `EMPLOYEE` and `ADMIN`. It uses database-side aggregate queries rather than composing list endpoints in the browser.

The response contains:

- `generatedAt`;
- four metrics: active orders, payments under review, open after-sales requests, and low-stock levels;
- priority queues: overdue payment review, overdue pickup, requested refunds, and newly requested after-sales support, each with a count, oldest timestamp, and canonical filter link;
- the five most recent orders with safe summary fields;
- no invented revenue, growth, or time-series claims.

The page includes real metrics, priority work, recent orders, and role-safe quick links. One refresh request updates the complete snapshot. If it fails after a prior success, the previous data and all quick links remain usable.

## Performance and security constraints

- Selecting a master-detail row performs zero extra list requests.
- The overview uses one browser request and a small bounded number of database-side aggregate queries.
- Health probes run concurrently and have per-provider timeouts.
- All health and overview data is typed in OpenAPI and consumed through the generated client.
- No new client state-management dependency is introduced.
- Existing backend guards remain the authority; frontend visibility is only an experience aid.

## Verification

- Unit tests cover canonical audit URLs, selection-independent list query keys, sidebar restoration, provider probes, safe health projection, and overview aggregation.
- Integration tests cover role guards and response contracts for both new endpoints.
- Browser verification covers detail selection, background refresh, sidebar route changes, health refresh, overview links, stock filter alignment, responsive layouts, keyboard focus, and failure states.
- Changes are committed in small concern-based commits.
