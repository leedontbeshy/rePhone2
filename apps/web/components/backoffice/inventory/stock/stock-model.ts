import {
  InventoryAdminError,
  inventoryErrorRequiresRefetch,
  type AdjustInventoryStockInput,
  type InventoryStockMovementType,
  type ReceiveInventoryStockInput,
  type ReturnInventoryStockInput,
  type TransferInventoryStockInput,
} from '@/lib/backoffice-inventory-api';

export const STOCK_PAGE_SIZE = 20;

export interface StockLevelQueryState {
  readonly locationId?: string;
  readonly lowStock?: boolean;
  readonly page: number;
  readonly pageSize: number;
  readonly variantId?: string;
}

export type StockLevelQueryOverrides = {
  readonly [Key in keyof StockLevelQueryState]?: StockLevelQueryState[Key] | undefined;
};

export interface StockMovementQueryState {
  readonly dateFrom?: string;
  readonly dateTo?: string;
  readonly locationId?: string;
  readonly page: number;
  readonly pageSize: number;
  readonly referenceId?: string;
  readonly referenceType?: string;
  readonly type?: InventoryStockMovementType;
  readonly variantId?: string;
}

export type StockMovementQueryOverrides = {
  readonly [Key in keyof StockMovementQueryState]?: StockMovementQueryState[Key] | undefined;
};

export type StockCommandKind = 'receive' | 'transfer' | 'adjust' | 'return';

export interface SortableStockVariantOption {
  readonly displayName: string;
  readonly id: string;
  readonly productName: string;
  readonly sku?: string;
}

export interface StockCommandDraft {
  readonly direction: 'IN' | 'OUT';
  readonly fromLocationId: string;
  readonly locationId: string;
  readonly quantity: string;
  readonly reason: string;
  readonly referenceId: string;
  readonly referenceType: '' | 'SHIPMENT' | 'AFTER_SALES_REQUEST';
  readonly toLocationId: string;
  readonly variantId: string;
}

export type StockCommandRequest =
  | { readonly kind: 'receive'; readonly input: ReceiveInventoryStockInput }
  | { readonly kind: 'transfer'; readonly input: TransferInventoryStockInput }
  | { readonly kind: 'adjust'; readonly input: AdjustInventoryStockInput }
  | { readonly kind: 'return'; readonly input: ReturnInventoryStockInput };

export type StockCommandField =
  | 'variantId'
  | 'locationId'
  | 'fromLocationId'
  | 'toLocationId'
  | 'quantity'
  | 'reason'
  | 'referenceType'
  | 'referenceId';

export interface StockCommandValidationResult {
  readonly command?: StockCommandRequest;
  readonly errors: Partial<Record<StockCommandField, string>>;
}

const MOVEMENT_TYPES: readonly InventoryStockMovementType[] = [
  'RECEIPT',
  'SALE',
  'RETURN',
  'TRANSFER',
  'ADJUSTMENT_IN',
  'ADJUSTMENT_OUT',
  'WRITE_OFF',
];

const STOCK_VARIANT_COLLATOR = new Intl.Collator('vi', {
  numeric: true,
  sensitivity: 'base',
});

export function stockPageWithinTotal(page: number, totalPages: number): number {
  const normalizedTotal = Number.isSafeInteger(totalPages) && totalPages > 0 ? totalPages : 1;
  if (!Number.isSafeInteger(page) || page < 1) return 1;
  return Math.min(page, normalizedTotal);
}

export function isCurrentStockRequest(
  request: number,
  latestRequest: number,
  signal?: Pick<AbortSignal, 'aborted'>,
): boolean {
  return request === latestRequest && signal?.aborted !== true;
}

export function sortStockVariantOptions<Option extends SortableStockVariantOption>(
  options: readonly Option[],
): Option[] {
  return [...options].sort((left, right) => {
    const productOrder = STOCK_VARIANT_COLLATOR.compare(left.productName, right.productName);
    if (productOrder !== 0) return productOrder;
    const variantOrder = STOCK_VARIANT_COLLATOR.compare(left.displayName, right.displayName);
    if (variantOrder !== 0) return variantOrder;
    const skuOrder = STOCK_VARIANT_COLLATOR.compare(left.sku ?? '', right.sku ?? '');
    return skuOrder !== 0 ? skuOrder : left.id.localeCompare(right.id);
  });
}

export function stockLevelQueryFromSearch(search: URLSearchParams): StockLevelQueryState {
  const lowStockValue = search.get('lowStock');
  return {
    page: positiveInteger(search.get('page'), 1),
    pageSize: Math.min(100, positiveInteger(search.get('pageSize'), STOCK_PAGE_SIZE)),
    ...optionalValue('variantId', search.get('variantId')),
    ...optionalValue('locationId', search.get('locationId')),
    ...(lowStockValue === 'true'
      ? { lowStock: true }
      : lowStockValue === 'false'
        ? { lowStock: false }
        : {}),
  };
}

export function mergeStockLevelQuery(
  current: StockLevelQueryState,
  overrides: StockLevelQueryOverrides,
): StockLevelQueryState {
  const next = { ...current, ...overrides };
  return {
    page: next.page ?? 1,
    pageSize: next.pageSize ?? STOCK_PAGE_SIZE,
    ...(next.variantId === undefined ? {} : { variantId: next.variantId }),
    ...(next.locationId === undefined ? {} : { locationId: next.locationId }),
    ...(next.lowStock === undefined ? {} : { lowStock: next.lowStock }),
  };
}

export function buildStockLevelHref(
  query: StockLevelQueryState,
  overrides: StockLevelQueryOverrides = {},
): string {
  const next = mergeStockLevelQuery(query, overrides);
  const params = new URLSearchParams();
  if (next.variantId) params.set('variantId', next.variantId);
  if (next.locationId) params.set('locationId', next.locationId);
  if (next.lowStock !== undefined) params.set('lowStock', String(next.lowStock));
  if (next.page > 1) params.set('page', String(next.page));
  if (next.pageSize !== STOCK_PAGE_SIZE) params.set('pageSize', String(next.pageSize));
  const value = params.toString();
  return value === '' ? '/backoffice/inventory/stock' : `/backoffice/inventory/stock?${value}`;
}

export function stockMovementQueryFromSearch(search: URLSearchParams): StockMovementQueryState {
  const type = enumValue(search.get('type'), MOVEMENT_TYPES);
  return {
    page: positiveInteger(search.get('page'), 1),
    pageSize: Math.min(100, positiveInteger(search.get('pageSize'), STOCK_PAGE_SIZE)),
    ...optionalValue('variantId', search.get('variantId')),
    ...optionalValue('locationId', search.get('locationId')),
    ...(type === undefined ? {} : { type }),
    ...optionalDate('dateFrom', search.get('dateFrom')),
    ...optionalDate('dateTo', search.get('dateTo')),
    ...optionalValue('referenceType', search.get('referenceType')),
    ...optionalValue('referenceId', search.get('referenceId')),
  };
}

export function mergeStockMovementQuery(
  current: StockMovementQueryState,
  overrides: StockMovementQueryOverrides,
): StockMovementQueryState {
  const next = { ...current, ...overrides };
  return {
    page: next.page ?? 1,
    pageSize: next.pageSize ?? STOCK_PAGE_SIZE,
    ...(next.variantId === undefined ? {} : { variantId: next.variantId }),
    ...(next.locationId === undefined ? {} : { locationId: next.locationId }),
    ...(next.type === undefined ? {} : { type: next.type }),
    ...(next.dateFrom === undefined ? {} : { dateFrom: next.dateFrom }),
    ...(next.dateTo === undefined ? {} : { dateTo: next.dateTo }),
    ...(next.referenceType === undefined ? {} : { referenceType: next.referenceType }),
    ...(next.referenceId === undefined ? {} : { referenceId: next.referenceId }),
  };
}

export function buildStockMovementHref(
  query: StockMovementQueryState,
  overrides: StockMovementQueryOverrides = {},
): string {
  const next = mergeStockMovementQuery(query, overrides);
  const params = new URLSearchParams();
  if (next.variantId) params.set('variantId', next.variantId);
  if (next.locationId) params.set('locationId', next.locationId);
  if (next.type) params.set('type', next.type);
  if (next.dateFrom) params.set('dateFrom', next.dateFrom);
  if (next.dateTo) params.set('dateTo', next.dateTo);
  if (next.referenceType) params.set('referenceType', next.referenceType);
  if (next.referenceId) params.set('referenceId', next.referenceId);
  if (next.page > 1) params.set('page', String(next.page));
  if (next.pageSize !== STOCK_PAGE_SIZE) params.set('pageSize', String(next.pageSize));
  const value = params.toString();
  return value === ''
    ? '/backoffice/inventory/stock/movements'
    : `/backoffice/inventory/stock/movements?${value}`;
}

export function emptyStockCommandDraft(
  defaults: Partial<Pick<StockCommandDraft, 'variantId' | 'locationId'>> = {},
): StockCommandDraft {
  return {
    direction: 'IN',
    fromLocationId: defaults.locationId ?? '',
    locationId: defaults.locationId ?? '',
    quantity: '1',
    reason: '',
    referenceId: '',
    referenceType: '',
    toLocationId: '',
    variantId: defaults.variantId ?? '',
  };
}

export function validateStockCommand(
  kind: StockCommandKind,
  draft: StockCommandDraft,
): StockCommandValidationResult {
  const errors: Partial<Record<StockCommandField, string>> = {};
  const variantId = draft.variantId.trim();
  const quantity = Number(draft.quantity);
  const reason = draft.reason.trim();
  if (variantId === '') errors.variantId = 'Hãy chọn phụ kiện cần xử lý.';
  if (!Number.isSafeInteger(quantity) || quantity <= 0) {
    errors.quantity = 'Số lượng phải là số nguyên lớn hơn 0.';
  }
  if (reason !== '' && (reason.length < 5 || reason.length > 500)) {
    errors.reason = 'Lý do cần từ 5 đến 500 ký tự.';
  }

  if (kind === 'receive') {
    const locationId = requiredLocation(draft.locationId, 'locationId', errors);
    if (Object.keys(errors).length > 0 || locationId === null) return { errors };
    return {
      errors,
      command: {
        kind,
        input: {
          variantId,
          locationId,
          quantity,
          ...(reason === '' ? {} : { reason }),
        },
      },
    };
  }

  if (kind === 'transfer') {
    const fromLocationId = requiredLocation(draft.fromLocationId, 'fromLocationId', errors);
    const toLocationId = requiredLocation(draft.toLocationId, 'toLocationId', errors);
    if (fromLocationId !== null && fromLocationId === toLocationId) {
      errors.toLocationId = 'Địa điểm nhận phải khác địa điểm xuất.';
    }
    if (Object.keys(errors).length > 0 || fromLocationId === null || toLocationId === null) {
      return { errors };
    }
    return {
      errors,
      command: {
        kind,
        input: {
          variantId,
          fromLocationId,
          toLocationId,
          quantity,
          ...(reason === '' ? {} : { reason }),
        },
      },
    };
  }

  const locationId = requiredLocation(draft.locationId, 'locationId', errors);
  if (reason === '') errors.reason = 'Hãy nhập lý do để lưu lịch sử điều chỉnh.';

  if (kind === 'adjust') {
    if (Object.keys(errors).length > 0 || locationId === null) return { errors };
    return {
      errors,
      command: {
        kind,
        input: { variantId, locationId, direction: draft.direction, quantity, reason },
      },
    };
  }

  const referenceId = draft.referenceId.trim();
  if (draft.referenceType === '') errors.referenceType = 'Hãy chọn nguồn hàng hoàn.';
  if (!isUuid(referenceId)) errors.referenceId = 'Mã tham chiếu chưa đúng định dạng.';
  if (Object.keys(errors).length > 0 || locationId === null || draft.referenceType === '') {
    return { errors };
  }
  return {
    errors,
    command: {
      kind,
      input: {
        variantId,
        locationId,
        quantity,
        referenceType: draft.referenceType,
        referenceId,
        reason,
      },
    },
  };
}

export function stockCommandLabel(kind: StockCommandKind): string {
  if (kind === 'receive') return 'Nhận hàng';
  if (kind === 'transfer') return 'Chuyển kho';
  if (kind === 'adjust') return 'Điều chỉnh';
  return 'Hoàn kho';
}

export function stockCommandErrorRequiresReconcile(error: unknown): boolean {
  return (
    inventoryErrorRequiresRefetch(error) ||
    (error instanceof InventoryAdminError && error.code === 'DUPLICATE_RESOURCE')
  );
}

export function stockCommandErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof InventoryAdminError && error.code === 'DUPLICATE_RESOURCE') {
    return 'Yêu cầu hoàn kho này đã được ghi nhận với thông tin khác. Hãy đối chiếu lịch sử kho trước khi thử lại.';
  }
  return error instanceof Error ? error.message : fallback;
}

function requiredLocation(
  value: string,
  field: 'locationId' | 'fromLocationId' | 'toLocationId',
  errors: Partial<Record<StockCommandField, string>>,
): string | null {
  const normalized = value.trim();
  if (normalized !== '') return normalized;
  errors[field] = 'Hãy chọn địa điểm.';
  return null;
}

function optionalValue<Key extends string>(
  key: Key,
  value: string | null,
): Partial<Record<Key, string>> {
  const normalized = value?.trim();
  return normalized ? ({ [key]: normalized } as Partial<Record<Key, string>>) : {};
}

function optionalDate<Key extends string>(
  key: Key,
  value: string | null,
): Partial<Record<Key, string>> {
  const normalized = value?.trim();
  return normalized !== undefined && /^\d{4}-\d{2}-\d{2}$/.test(normalized)
    ? ({ [key]: normalized } as Partial<Record<Key, string>>)
    : {};
}

function positiveInteger(value: string | null, fallback: number): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function enumValue<const Values extends readonly string[]>(
  value: string | null,
  values: Values,
): Values[number] | undefined {
  return value !== null && values.includes(value) ? value : undefined;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
