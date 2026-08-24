export const AFTER_SALES_TYPES = ['WARRANTY', 'RETURN', 'EXCHANGE'] as const;
export const AFTER_SALES_STATUSES = [
  'REQUESTED',
  'RECEIVED',
  'INSPECTING',
  'APPROVED',
  'REJECTED',
  'RESOLVED',
  'CANCELLED',
] as const;
export const AFTER_SALES_RESOLUTIONS = [
  'REPAIRED',
  'REPLACED',
  'REFUNDED',
  'RETURNED_UNCHANGED',
  'OTHER',
] as const;

export type AfterSalesStatus = (typeof AFTER_SALES_STATUSES)[number];
export type AfterSalesType = (typeof AFTER_SALES_TYPES)[number];
export type AfterSalesResolution = (typeof AFTER_SALES_RESOLUTIONS)[number];

export const CUSTOMER_AFTER_SALES_ACTIONS = ['UPLOAD_ATTACHMENT', 'CANCEL'] as const;
export type CustomerAfterSalesAction = (typeof CUSTOMER_AFTER_SALES_ACTIONS)[number];

export const BACKOFFICE_AFTER_SALES_ACTIONS = [
  'ASSIGN',
  'RECEIVE',
  'START_INSPECTION',
  'RECORD_INSPECTION_SUMMARY',
  'APPROVE',
  'REJECT',
  'RESOLVE_REPAIRED',
  'RESOLVE_REPLACED',
  'RESOLVE_REFUNDED',
  'RESOLVE_RETURNED_UNCHANGED',
  'RESOLVE_OTHER',
] as const;
export type BackofficeAfterSalesAction = (typeof BACKOFFICE_AFTER_SALES_ACTIONS)[number];

export function customerAfterSalesActions(status: AfterSalesStatus): CustomerAfterSalesAction[] {
  if (status === 'REQUESTED') return ['UPLOAD_ATTACHMENT', 'CANCEL'];
  if (status === 'RECEIVED' || status === 'INSPECTING') return ['UPLOAD_ATTACHMENT'];
  return [];
}

export function backofficeAfterSalesActions(
  status: AfterSalesStatus,
  isIphone: boolean,
  role: 'EMPLOYEE' | 'ADMIN',
): BackofficeAfterSalesAction[] {
  if (status === 'REQUESTED') return ['ASSIGN', 'RECEIVE'];
  if (status === 'RECEIVED') return ['ASSIGN', 'START_INSPECTION'];
  if (status === 'INSPECTING') {
    return isIphone
      ? ['ASSIGN', 'APPROVE', 'REJECT']
      : ['ASSIGN', 'RECORD_INSPECTION_SUMMARY', 'APPROVE', 'REJECT'];
  }
  if (status !== 'APPROVED') return [];

  const actions: BackofficeAfterSalesAction[] = [
    'ASSIGN',
    'RESOLVE_REPAIRED',
    'RESOLVE_REFUNDED',
    'RESOLVE_RETURNED_UNCHANGED',
  ];
  if (isIphone) actions.splice(2, 0, 'RESOLVE_REPLACED');
  if (role === 'ADMIN') actions.push('RESOLVE_OTHER');
  return actions;
}

export function isWarrantyValid(
  warranty: { status: 'ACTIVE' | 'VOIDED'; startAt: Date; endAt: Date },
  now: Date,
): boolean {
  return warranty.status === 'ACTIVE' && warranty.startAt <= now && now < warranty.endAt;
}
