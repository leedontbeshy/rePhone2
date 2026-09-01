import type { FrontendBusinessPhase, FrontendRequiredState } from './frontend-coverage';

/**
 * Structural ownership registry for browser work.
 *
 * A registered owner proves that its suite and stable test declaration exist;
 * it does not prove that every owned API operation or UI state executed. Runtime
 * request/state assertions remain acceptance criteria for the owning surface WP.
 */

export interface FrontendBrowserTestDefinition {
  readonly title: string;
  readonly ownsRoutes: readonly string[];
  readonly coversRoutes: readonly string[];
  readonly ownsStates: readonly FrontendRequiredState[];
  /** Optional shard file for large suites; defaults to the suite's primary spec file. */
  readonly specFile?: string;
}

export interface FrontendBrowserSuiteDefinition {
  readonly specFile: string;
  readonly phase: FrontendBusinessPhase | null;
  readonly tests: Readonly<Record<string, FrontendBrowserTestDefinition>>;
}

export const FRONTEND_BROWSER_SUITES = {
  'browser:frontend-foundation': {
    specFile: 'frontend-foundation.spec.ts',
    phase: null,
    tests: {
      'exact-unit-visual': {
        title: 'captures the representative exact-unit surface at desktop and mobile',
        ownsRoutes: [],
        coversRoutes: ['/products/[slug]/units/[inventoryCode]'],
        ownsStates: ['success'],
      },
      'legacy-keyboard': {
        title: 'keeps the legacy storefront keyboard reachable during migration',
        ownsRoutes: [],
        coversRoutes: ['/products'],
        ownsStates: ['success'],
      },
    },
  },
  'browser:storefront-discovery': {
    specFile: 'storefront-discovery.spec.ts',
    phase: 'FE-1',
    tests: {
      'public-six-surfaces': {
        title: 'browses the six public surfaces using the seeded iPhone 14 dossier',
        ownsRoutes: [
          '/',
          '/store',
          '/products',
          '/products/[slug]',
          '/products/[slug]/units/[inventoryCode]',
          '/vouchers',
        ],
        coversRoutes: [],
        ownsStates: ['success'],
      },
      'header-balance': {
        title: 'keeps the shared header balanced and store actions clear across viewports',
        ownsRoutes: [],
        coversRoutes: ['/', '/store'],
        ownsStates: [],
      },
      'search-suggestions-keyboard': {
        title: 'navigates product suggestions from the shared storefront search by keyboard',
        ownsRoutes: [],
        coversRoutes: ['/', '/products/[slug]'],
        ownsStates: ['success'],
      },
      'keyboard-interactions': {
        title: 'keeps mobile navigation, catalog filters and media dialogs keyboard-operable',
        ownsRoutes: [],
        coversRoutes: ['/', '/products', '/products/[slug]/units/[inventoryCode]'],
        ownsStates: ['success'],
      },
      'accessory-card-alignment': {
        title: 'keeps accessory cards and their actions aligned when optional details differ',
        ownsRoutes: [],
        coversRoutes: ['/products'],
        ownsStates: ['success'],
      },
      'url-filter-history': {
        title: 'keeps URL filters authoritative across pagination and browser history',
        ownsRoutes: [],
        coversRoutes: ['/products'],
        ownsStates: ['success'],
      },
      'ssr-contracts': {
        title: 'server-renders the six public contracts without browser JavaScript',
        ownsRoutes: [],
        coversRoutes: [
          '/',
          '/store',
          '/products',
          '/products/[slug]',
          '/products/[slug]/units/[inventoryCode]',
          '/vouchers',
        ],
        ownsStates: ['success'],
      },
      'public-unit-safety': {
        title: 'keeps exact-unit facts public-safe and avoids unverified merchandising claims',
        ownsRoutes: [],
        coversRoutes: ['/products/[slug]/units/[inventoryCode]'],
        ownsStates: ['success'],
      },
      'account-voucher': {
        title: 'shows account-only vouchers only after customer authentication',
        ownsRoutes: [],
        coversRoutes: ['/vouchers'],
        ownsStates: ['permission', 'success'],
      },
      'a11y-mobile': {
        title: 'passes serious accessibility checks and stays within a 320px viewport',
        ownsRoutes: [],
        coversRoutes: [
          '/',
          '/store',
          '/products',
          '/products/[slug]',
          '/products/[slug]/units/[inventoryCode]',
          '/vouchers',
        ],
        ownsStates: ['success'],
      },
      'responsive-route-matrix': {
        title: 'keeps all six public surfaces usable without overflow from 320px to 1440px',
        ownsRoutes: [],
        coversRoutes: [
          '/',
          '/store',
          '/products',
          '/products/[slug]',
          '/products/[slug]/units/[inventoryCode]',
          '/vouchers',
        ],
        ownsStates: ['success'],
      },
      'mobile-generation-shelf': {
        title: 'keeps generation shelves scrollable without overflowing the mobile document',
        ownsRoutes: [],
        coversRoutes: ['/'],
        ownsStates: ['success'],
      },
      'footer-links': {
        title: 'exposes generation and store contact links in the shared footer',
        ownsRoutes: [],
        coversRoutes: ['/'],
        ownsStates: ['success'],
      },
      'skip-navigation': {
        title: 'keeps skip navigation keyboard-operable on the canonical dossier',
        ownsRoutes: [],
        coversRoutes: ['/products/[slug]/units/[inventoryCode]'],
        ownsStates: ['success'],
      },
      'unavailable-unit-recovery': {
        title: 'recovers an unavailable exact unit back to its model',
        ownsRoutes: [],
        coversRoutes: ['/products/[slug]/units/[inventoryCode]'],
        ownsStates: ['unavailable'],
      },
      'mobile-purchase-footer': {
        title: 'hides the mobile purchase bar before it can cover the footer',
        ownsRoutes: [],
        coversRoutes: ['/products/[slug]/units/[inventoryCode]'],
        ownsStates: ['success'],
      },
      'model-unit-visual': {
        title: 'captures the canonical model and exact-unit details at desktop and mobile',
        ownsRoutes: [],
        coversRoutes: ['/products/[slug]', '/products/[slug]/units/[inventoryCode]'],
        ownsStates: ['success'],
      },
    },
  },
  'browser:auth-account': {
    specFile: 'auth-account.spec.ts',
    phase: 'FE-2',
    tests: {
      'reset-password-fragment': {
        title: 'consumes a reset token from the fragment before submitting it',
        ownsRoutes: ['/reset-password'],
        coversRoutes: ['/login', '/account'],
        ownsStates: ['success'],
      },
      'staff-invitation': {
        title: 'consumes an employee invitation without auto-login and uses the staff destination',
        ownsRoutes: ['/accept-invitation'],
        coversRoutes: ['/login', '/backoffice', '/account/addresses'],
        ownsStates: ['permission', 'success'],
      },
      'account-lifecycle': {
        title: 'runs the customer session, profile, address and password lifecycle',
        ownsRoutes: ['/login', '/register', '/account', '/account/addresses', '/account/security'],
        coversRoutes: [],
        ownsStates: ['empty', 'error', 'success', 'warning'],
      },
      'account-load-recovery': {
        title: 'recovers account regions locally and locks profile updates without navigation',
        ownsRoutes: [],
        coversRoutes: ['/account', '/account/addresses'],
        ownsStates: ['loading', 'error', 'pending', 'success'],
      },
      'auth-submit-lock': {
        title: 'locks authentication submission while the authoritative response is pending',
        ownsRoutes: [],
        coversRoutes: ['/login'],
        ownsStates: ['disabled', 'pending', 'success'],
      },
      'one-time-token-invalid': {
        title: 'retires missing, malformed and rejected one-time tokens without replay',
        ownsRoutes: [],
        coversRoutes: ['/reset-password', '/accept-invitation'],
        ownsStates: ['unavailable'],
      },
      'registration-enumeration': {
        title: 'does not disclose an existing email in the registration interface',
        ownsRoutes: [],
        coversRoutes: ['/register'],
        ownsStates: ['error'],
      },
      'auth-route-state-matrix': {
        title: 'keeps authentication routes keyboard-accessible and responsive on mobile',
        ownsRoutes: [],
        coversRoutes: [
          '/login',
          '/register',
          '/forgot-password',
          '/reset-password',
          '/accept-invitation',
        ],
        ownsStates: ['error'],
      },
      'forgot-password-enumeration': {
        title: 'keeps forgot-password responses enumeration-safe',
        ownsRoutes: ['/forgot-password'],
        coversRoutes: [],
        ownsStates: ['success'],
      },
    },
  },
  'browser:backoffice-access': {
    specFile: 'backoffice-access.spec.ts',
    phase: null,
    tests: {
      'anonymous-fail-closed': {
        title:
          'never renders or requests a protected page while an anonymous session is unresolved',
        ownsRoutes: [],
        coversRoutes: ['/backoffice'],
        ownsStates: ['loading', 'permission'],
      },
      'customer-mobile-denied': {
        title: 'blocks a customer on mobile without mounting the inventory workspace',
        ownsRoutes: [],
        coversRoutes: ['/backoffice/inventory/units'],
        ownsStates: ['permission'],
      },
      'network-error-retry': {
        title:
          'fails closed on a network error and opens the overview only after a successful retry',
        ownsRoutes: ['/backoffice'],
        coversRoutes: [],
        ownsStates: ['error', 'permission', 'success'],
      },
    },
  },
  'browser:cart-checkout': {
    specFile: 'cart-checkout.spec.ts',
    phase: 'FE-3',
    tests: {
      'guest-shipping-order': {
        title: 'guest creates a shipping order and hands off the one-time order link',
        ownsRoutes: ['/cart', '/checkout'],
        coversRoutes: ['/orders/[orderNumber]'],
        ownsStates: ['pending', 'success'],
      },
      'customer-pickup-wishlist': {
        title: 'customer merges a guest unit, uses wishlist and creates a pickup order',
        ownsRoutes: ['/wishlist'],
        coversRoutes: ['/cart', '/checkout'],
        ownsStates: ['pending', 'success'],
      },
      'guest-cart-merge-retry': {
        title: 'lets a customer retry a failed guest-cart merge without losing the selected unit',
        ownsRoutes: [],
        coversRoutes: ['/cart'],
        ownsStates: ['error', 'success'],
      },
      'checkout-reconfirmation': {
        title:
          'requires an explicit reconfirmation after checkout changes and never retries automatically',
        ownsRoutes: [],
        coversRoutes: ['/checkout'],
        ownsStates: ['warning', 'conflict', 'pending'],
      },
      'checkout-entry-scroll': {
        title: 'opens checkout at the page start with its heading clear of the sticky header',
        ownsRoutes: [],
        coversRoutes: ['/cart', '/checkout'],
        ownsStates: ['success'],
      },
      'checkout-summary-fallback-layout': {
        title: 'contains the compact checkout image fallback from desktop down to 320px',
        ownsRoutes: [],
        coversRoutes: ['/checkout'],
        ownsStates: ['success'],
      },
      'cart-local-loading': {
        title: 'keeps populated cart rows and summary visible during a retry refresh',
        ownsRoutes: [],
        coversRoutes: ['/cart'],
        ownsStates: ['error', 'pending', 'success'],
      },
      'wishlist-role-state-matrix': {
        title: 'keeps wishlist states customer-only across anonymous, customer and staff roles',
        ownsRoutes: [],
        coversRoutes: ['/wishlist'],
        ownsStates: ['empty', 'error', 'permission', 'success'],
      },
      'wishlist-mutation-lifecycle': {
        title: 'handles wishlist add and remove lifecycles without reducing accessory quantity',
        ownsRoutes: [],
        coversRoutes: ['/wishlist', '/cart'],
        ownsStates: ['error', 'pending', 'success'],
      },
      'checkout-validation-preview-authority': {
        title:
          'focuses the first invalid field and renders pricing, voucher and fulfillment from preview',
        ownsRoutes: [],
        coversRoutes: ['/checkout'],
        ownsStates: ['error', 'success'],
      },
      'checkout-conflict-recovery': {
        title: 'clears stale preview authority after a non-review checkout conflict',
        ownsRoutes: [],
        coversRoutes: ['/checkout'],
        ownsStates: ['conflict', 'error', 'success'],
      },
      'checkout-uncertain-manual-replay': {
        title: 'replays a lost checkout response only after explicit customer recovery',
        ownsRoutes: [],
        coversRoutes: ['/checkout', '/orders/[orderNumber]'],
        ownsStates: ['pending', 'success', 'warning'],
      },
      'commerce-responsive-visual': {
        title:
          'keeps populated cart, wishlist and checkout states accessible across five viewports',
        ownsRoutes: [],
        coversRoutes: ['/cart', '/wishlist', '/checkout'],
        ownsStates: ['conflict', 'success'],
      },
    },
  },
  'browser:catalog-voucher-admin': {
    specFile: 'catalog-voucher-admin.spec.ts',
    phase: 'FE-5',
    tests: {
      'employee-boundary': {
        title: 'lets an employee use all catalog screens while keeping voucher management private',
        ownsRoutes: ['/backoffice/catalog/products', '/backoffice/vouchers'],
        coversRoutes: [],
        ownsStates: ['permission', 'success'],
      },
      'catalog-draft-lifecycle': {
        title: 'creates a catalog draft with named fields and opens it for sale',
        ownsRoutes: ['/backoffice/catalog/products/new', '/backoffice/catalog/products/[id]'],
        coversRoutes: ['/backoffice/catalog/products'],
        ownsStates: ['pending', 'success'],
      },
      'voucher-lifecycle': {
        title: 'creates a typed voucher and covers activation and pause lifecycle actions',
        ownsRoutes: ['/backoffice/vouchers/new', '/backoffice/vouchers/[id]'],
        coversRoutes: ['/backoffice/vouchers'],
        ownsStates: ['pending', 'success'],
      },
      'admin-responsive': {
        title: 'keeps all six administration screens inside desktop and 360px viewports',
        ownsRoutes: [],
        coversRoutes: [
          '/backoffice/catalog/products',
          '/backoffice/catalog/products/new',
          '/backoffice/catalog/products/[id]',
          '/backoffice/vouchers',
          '/backoffice/vouchers/new',
          '/backoffice/vouchers/[id]',
        ],
        ownsStates: ['success'],
      },
    },
  },
  'browser:critical-commerce-flow': {
    specFile: 'critical-commerce-flow.spec.ts',
    phase: null,
    tests: {
      'catalog-to-completed-shipping': {
        title: 'catalog to completed shipping order through customer and staff portals',
        ownsRoutes: [],
        coversRoutes: [
          '/products/[slug]/units/[inventoryCode]',
          '/cart',
          '/checkout',
          '/account',
          '/orders/[orderNumber]',
          '/backoffice/orders',
          '/backoffice/orders/[id]',
          '/warranties/[warrantyCode]',
        ],
        ownsStates: ['pending', 'success'],
      },
    },
  },
  'browser:customer-post-purchase': {
    specFile: 'customer-post-purchase.spec.ts',
    phase: 'FE-4',
    tests: {
      'customer-order-lifecycle': {
        title: 'covers the customer order list, detail journey, cancellation and URL allowlist',
        ownsRoutes: ['/orders', '/orders/[orderNumber]'],
        coversRoutes: [],
        ownsStates: ['error', 'pending', 'success'],
      },
      'guest-order-privacy': {
        title: 'tries cookie-backed guest access and keeps a rejected detail private',
        ownsRoutes: [],
        coversRoutes: ['/orders/[orderNumber]'],
        ownsStates: ['permission'],
      },
      'warranty-list-detail': {
        title: 'covers warranty list and detail without nested landmarks',
        ownsRoutes: ['/warranties', '/warranties/[warrantyCode]'],
        coversRoutes: [],
        ownsStates: ['success'],
      },
      'after-sales-journey': {
        title: 'covers after-sales list, creation context and detail actions',
        ownsRoutes: ['/after-sales', '/after-sales/new', '/after-sales/[requestNumber]'],
        coversRoutes: [],
        ownsStates: ['pending', 'success'],
      },
      'post-purchase-mobile': {
        title: 'keeps post-purchase collections inside a 390px mobile viewport',
        ownsRoutes: [],
        coversRoutes: ['/orders', '/warranties', '/after-sales'],
        ownsStates: ['success'],
      },
    },
  },
  'browser:inventory-stock': {
    specFile: 'inventory-stock.spec.ts',
    phase: 'FE-6',
    tests: {
      'employee-cost-privacy': {
        title: 'keeps the employee unit profile free of cost requests and cost UI',
        ownsRoutes: ['/backoffice/inventory/units/[id]'],
        coversRoutes: [],
        ownsStates: ['permission', 'success'],
      },
      'identifier-lookup-post': {
        title: 'looks up a raw identifier through an automatically audited POST body',
        ownsRoutes: ['/backoffice/inventory/lookup'],
        coversRoutes: [],
        ownsStates: ['pending', 'success'],
      },
      'unit-filter-no-reload': {
        title:
          'filters the unit queue without reloading and blocks raw identifiers from URLs and GETs',
        ownsRoutes: ['/backoffice/inventory/units'],
        coversRoutes: [],
        ownsStates: ['loading', 'success'],
      },
      'inspection-completion': {
        title: 'reviews all 18 inspection items, confirms completion, then returns to intake',
        ownsRoutes: ['/backoffice/inventory/inspections/[id]'],
        coversRoutes: ['/backoffice/inventory/intake'],
        ownsStates: ['disabled', 'pending', 'success'],
      },
      'intake-resume-upload': {
        title:
          'restores an existing intake without flashing step one and uploads through the custom picker',
        ownsRoutes: ['/backoffice/inventory/intake'],
        coversRoutes: ['/backoffice/inventory/inspections/[id]'],
        ownsStates: ['loading', 'pending', 'success', 'upload-progress'],
      },
      'mobile-step-four': {
        title: 'keeps step four visible inside the mobile progress scroller after resume',
        ownsRoutes: [],
        coversRoutes: ['/backoffice/inventory/intake'],
        ownsStates: ['success'],
      },
      'inspection-source-integrity': {
        title: 'does not trust an intake source marker for another inspection type',
        ownsRoutes: [],
        coversRoutes: ['/backoffice/inventory/inspections/[id]'],
        ownsStates: ['error'],
      },
      'stock-ledger': {
        title: 'records a stock command, reconciles levels and exposes the immutable ledger',
        ownsRoutes: ['/backoffice/inventory/stock', '/backoffice/inventory/stock/movements'],
        coversRoutes: [],
        ownsStates: ['conflict', 'pending', 'success'],
      },
      'inventory-responsive': {
        title: 'renders all eight inventory routes without document overflow at 1440px and 360px',
        ownsRoutes: ['/backoffice/inventory/locations'],
        coversRoutes: [
          '/backoffice/inventory/intake',
          '/backoffice/inventory/units',
          '/backoffice/inventory/units/[id]',
          '/backoffice/inventory/lookup',
          '/backoffice/inventory/inspections/[id]',
          '/backoffice/inventory/locations',
          '/backoffice/inventory/stock',
          '/backoffice/inventory/stock/movements',
        ],
        ownsStates: ['success'],
      },
    },
  },
  'browser:operations-lifecycle': {
    specFile: 'operations-lifecycle.spec.ts',
    phase: 'FE-7',
    tests: {
      'staff-route-state-matrix': {
        title: 'keeps all eleven operations routes inside the authenticated staff workspace',
        ownsRoutes: [
          '/backoffice/orders',
          '/backoffice/orders/[id]',
          '/backoffice/payments',
          '/backoffice/payments/[id]',
          '/backoffice/refunds',
          '/backoffice/refunds/[id]',
          '/backoffice/after-sales',
          '/backoffice/after-sales/[id]',
          '/backoffice/warranties',
          '/backoffice/warranties/[id]',
          '/backoffice/warranty-policies',
        ],
        coversRoutes: [],
        ownsStates: ['empty', 'success'],
      },
      'order-pickup-lifecycle': {
        title:
          'confirms, prepares, extends, readies and completes a pickup order without duplicate commands',
        ownsRoutes: [],
        coversRoutes: ['/backoffice/orders', '/backoffice/orders/[id]'],
        ownsStates: ['conflict', 'pending', 'success'],
      },
      'order-shipping-lifecycle': {
        title:
          'creates and advances a shipment through hand-over, failure, return and delivery projections',
        ownsRoutes: [],
        coversRoutes: ['/backoffice/orders/[id]'],
        ownsStates: ['pending', 'success'],
      },
      'queue-local-refresh': {
        title:
          'keeps the loaded order queue, scroll position and document while a filter refreshes locally',
        ownsRoutes: [],
        coversRoutes: ['/backoffice/orders'],
        ownsStates: ['loading', 'success'],
      },
      'payment-review-evidence': {
        title:
          'reviews payment evidence and verifies or rejects only from the latest authoritative projection',
        ownsRoutes: [],
        coversRoutes: ['/backoffice/payments', '/backoffice/payments/[id]'],
        ownsStates: ['conflict', 'pending', 'provider-error', 'success'],
        specFile: 'operations-finance-ui.spec.ts',
      },
      'refund-processing-lifecycle': {
        title:
          'processes cash and bank-transfer refunds with validated evidence and duplicate-submit protection',
        ownsRoutes: [],
        coversRoutes: ['/backoffice/refunds', '/backoffice/refunds/[id]'],
        ownsStates: ['pending', 'success', 'upload-progress'],
        specFile: 'operations-finance-ui.spec.ts',
      },
      'after-sales-intake-decision': {
        title:
          'assigns, receives, inspects and decides an after-sales request from authoritative actions',
        ownsRoutes: [],
        coversRoutes: ['/backoffice/after-sales', '/backoffice/after-sales/[id]'],
        ownsStates: ['conflict', 'pending', 'success'],
        specFile: 'operations-after-sales-ui.spec.ts',
      },
      'after-sales-resolution-matrix': {
        title:
          'resolves after-sales requests through repaired, replaced, refunded, returned and administrator-only outcomes',
        ownsRoutes: [],
        coversRoutes: ['/backoffice/after-sales/[id]'],
        ownsStates: ['permission', 'pending', 'success'],
        specFile: 'operations-after-sales-ui.spec.ts',
      },
      'after-sales-evidence-refresh': {
        title:
          'opens each after-sales attachment with a fresh safe URL and recovers provider failures locally',
        ownsRoutes: [],
        coversRoutes: ['/backoffice/after-sales/[id]'],
        ownsStates: ['error', 'pending', 'provider-error', 'success'],
        specFile: 'operations-after-sales-ui.spec.ts',
      },
      'warranty-void-boundary': {
        title:
          'keeps warranty records role-safe and voids them only after administrator confirmation',
        ownsRoutes: [],
        coversRoutes: ['/backoffice/warranties', '/backoffice/warranties/[id]'],
        ownsStates: ['conflict', 'permission', 'pending', 'success'],
        specFile: 'operations-warranty-ui.spec.ts',
      },
      'warranty-policy-lifecycle': {
        title:
          'creates, edits, activates, deactivates and archives warranty policies with authoritative conflict recovery',
        ownsRoutes: [],
        coversRoutes: ['/backoffice/warranty-policies'],
        ownsStates: ['conflict', 'pending', 'success'],
        specFile: 'operations-warranty-ui.spec.ts',
      },
    },
  },
  'browser:system-admin-health': {
    specFile: 'system-admin-health.spec.ts',
    phase: 'FE-8',
    tests: {
      'live-admin-route-matrix': {
        title: 'renders six system administration routes from live backend projections',
        ownsRoutes: [
          '/backoffice/employees',
          '/backoffice/customers',
          '/backoffice/settings',
          '/backoffice/audit-logs',
          '/backoffice/audit-logs/[id]',
          '/backoffice/system/health',
        ],
        coversRoutes: ['/backoffice'],
        ownsStates: ['loading', 'error', 'success', 'stale', 'provider-error'],
      },
    },
  },
} as const satisfies Record<string, FrontendBrowserSuiteDefinition>;

export type FrontendBrowserSuiteId = keyof typeof FRONTEND_BROWSER_SUITES;

export type FrontendBrowserTestId<SuiteId extends FrontendBrowserSuiteId> =
  keyof (typeof FRONTEND_BROWSER_SUITES)[SuiteId]['tests'] & string;

export function browserTestTitle<SuiteId extends FrontendBrowserSuiteId>(
  suiteId: SuiteId,
  testId: FrontendBrowserTestId<SuiteId>,
): string {
  const suite: FrontendBrowserSuiteDefinition = FRONTEND_BROWSER_SUITES[suiteId];
  const definition = suite.tests[testId];
  if (definition === undefined) {
    throw new Error(`Unknown frontend browser test ${suiteId}#${testId}`);
  }
  return `[${suiteId}#${testId}] ${definition.title}`;
}
