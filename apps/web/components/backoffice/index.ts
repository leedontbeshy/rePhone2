export { BackofficeActionDialog, validateBackofficeActionReason } from './backoffice-action-dialog';
export type {
  BackofficeActionDialogProps,
  BackofficeActionDialogReason,
} from './backoffice-action-dialog';
export { BackofficeAccessGate } from './backoffice-access-gate';
export type { BackofficeAccessGateProps } from './backoffice-access-gate';
export {
  BackofficeDataBoard,
  BackofficeFilterToolbar,
  BackofficePagination,
  CatalogVoucherStatusChip,
  paginationItems,
} from './catalog-voucher-primitives';
export type {
  BackofficeDataBoardProps,
  BackofficeDataColumn,
  BackofficeFilterToolbarProps,
  BackofficePaginationProps,
  CatalogVoucherStatus,
} from './catalog-voucher-primitives';
export {
  canAccessCatalogVoucherPath,
  catalogVoucherAccessForPath,
  catalogVoucherNavigationForRole,
  CATALOG_PRODUCTS_ROOT,
  VOUCHERS_ROOT,
} from './catalog-voucher-navigation';
export type { CatalogVoucherAccess } from './catalog-voucher-navigation';
export { CatalogVoucherShell } from './catalog-voucher-shell';
export type { CatalogVoucherShellProps } from './catalog-voucher-shell';
export {
  canAccessInventoryWorkspace,
  canViewInventoryCost,
  INVENTORY_INTAKE_ROOT,
  INVENTORY_INSPECTIONS_ROOT,
  INVENTORY_LOCATIONS_ROOT,
  INVENTORY_LOOKUP_ROOT,
  INVENTORY_STOCK_MOVEMENTS_ROOT,
  INVENTORY_STOCK_ROOT,
  INVENTORY_UNITS_ROOT,
  inventoryNavigationForPath,
} from './inventory/inventory-navigation';
export type { InventoryNavigationItem } from './inventory/inventory-navigation';
export {
  inspectionCheckStatusLabel,
  inspectionCheckStatusPresentation,
  inspectionResultLabel,
  inspectionResultPresentation,
  inspectionStatusLabel,
  inspectionStatusPresentation,
  inspectionTypeLabel,
  inventoryLifecycleLabel,
  inventoryLifecyclePresentation,
  stockLevelPresentation,
  stockMovementLabel,
} from './inventory/inventory-presenter';
export type {
  InventoryInspectionCheckStatus,
  InventoryInspectionResult,
  InventoryInspectionStatus,
  InventoryInspectionType,
  InventoryLifecycleStatus,
  InventoryStatusPresentation,
  InventoryStockMovementType,
} from './inventory/inventory-presenter';
export { InventoryShell } from './inventory/inventory-shell';
export type { InventoryShellProps } from './inventory/inventory-shell';
export {
  canAccessOperationsWorkspace,
  OPERATIONS_AFTER_SALES_ROOT,
  OPERATIONS_ORDERS_ROOT,
  OPERATIONS_PAYMENTS_ROOT,
  OPERATIONS_REFUNDS_ROOT,
  OPERATIONS_WARRANTIES_ROOT,
  OPERATIONS_WARRANTY_POLICIES_ROOT,
  operationsNavigationForRole,
} from './operations/operations-navigation';
export {
  OperationsActionRail,
  OperationsDetailLayout,
  OperationsMoneySummary,
  OperationsPageHeader,
  OperationsPanel,
  OperationsStatusAxes,
  OperationsTimeline,
} from './operations/operations-primitives';
export type {
  OperationsActionRailProps,
  OperationsMoneyRow,
  OperationsPageHeaderProps,
  OperationsPanelProps,
  OperationsStatusAxis,
  OperationsTimelineItem,
  OperationsTone,
} from './operations/operations-primitives';
export { OperationsShell } from './operations/operations-shell';
export type { OperationsShellProps } from './operations/operations-shell';
export * from './system';
