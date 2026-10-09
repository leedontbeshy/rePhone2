export type DealerBusinessStatus =
  'PENDING' | 'ACTIVE' | 'REJECTED' | 'BUSINESS_SUSPENDED' | 'CLOSED';
export type DealerSecurityStatus = 'NORMAL' | 'SECURITY_LOCKED';

export interface DealerAccessContext {
  businessStatus: DealerBusinessStatus;
  securityStatus: DealerSecurityStatus;
}

export type DealerCapability =
  | 'CATALOG_READ'
  | 'CREATE_ORDER'
  | 'ISSUE_API_KEY'
  | 'READ_EXISTING_ORDER'
  | 'PAY_EXISTING_ORDER'
  | 'CANCEL_EXISTING_ORDER'
  | 'AFTER_SALES'
  | 'DELIVER_ORDER_WEBHOOK';

const EXISTING_BUSINESS_CAPABILITIES = new Set<DealerCapability>([
  'READ_EXISTING_ORDER',
  'PAY_EXISTING_ORDER',
  'CANCEL_EXISTING_ORDER',
  'AFTER_SALES',
  'DELIVER_ORDER_WEBHOOK',
]);

/** Credential validity, scopes and resource ownership must also pass at the boundary. */
export function allowsDealerCapability(
  context: DealerAccessContext,
  capability: DealerCapability,
): boolean {
  if (context.securityStatus !== 'NORMAL') return false;
  if (context.businessStatus === 'ACTIVE') return true;
  return (
    (context.businessStatus === 'BUSINESS_SUSPENDED' || context.businessStatus === 'CLOSED') &&
    EXISTING_BUSINESS_CAPABILITIES.has(capability)
  );
}

export function allowsDealerWebhook(
  context: DealerAccessContext,
  resource: 'CATALOG' | 'EXISTING_ORDER',
): boolean {
  return allowsDealerCapability(
    context,
    resource === 'CATALOG' ? 'CATALOG_READ' : 'DELIVER_ORDER_WEBHOOK',
  );
}
