'use client';

import {
  ArrowsLeftRightIcon,
  ArrowUDownLeftIcon,
  ClockCounterClockwiseIcon,
  PackageIcon,
  SlidersHorizontalIcon,
} from '@phosphor-icons/react/ssr';
import Link from 'next/link';
import { useEffect, useState, type MouseEvent, type SyntheticEvent } from 'react';
import {
  BackofficeDataBoard,
  BackofficePagination,
  stockLevelPresentation,
  type BackofficeDataColumn,
} from '@/components/backoffice';
import { Button, InlineAlert, Input, Select, StatusChip, Textarea } from '@/components/ui';
import { useModalDialogLifecycle } from '@/components/ui/modal-dialog-lifecycle';
import type {
  InventoryLocation,
  InventoryStockLevel,
  InventoryVariantSummary,
} from '@/lib/backoffice-inventory-api';
import {
  buildStockLevelHref,
  emptyStockCommandDraft,
  stockCommandLabel,
  validateStockCommand,
  type StockCommandDraft,
  type StockCommandField,
  type StockCommandKind,
  type StockCommandRequest,
  type StockLevelQueryOverrides,
  type StockLevelQueryState,
} from './stock-model';
import boardStyles from '../inventory-data-board.module.css';
import styles from './inventory-stock.module.css';

export interface InventoryStockPagination {
  readonly page: number;
  readonly pageSize: number;
  readonly totalItems: number;
  readonly totalPages: number;
}

export interface StockVariantOption extends InventoryVariantSummary {
  readonly productName: string;
}

export type StockCommandOutcome =
  { readonly ok: true } | { readonly message: string; readonly ok: false };

export interface InventoryStockViewProps {
  readonly error?: string | null;
  readonly levels: readonly InventoryStockLevel[];
  readonly loading?: boolean;
  readonly locations: readonly InventoryLocation[];
  readonly onCommand: (command: StockCommandRequest) => Promise<StockCommandOutcome>;
  readonly onQueryChange: (overrides: StockLevelQueryOverrides) => void;
  readonly pagination: InventoryStockPagination;
  readonly query: StockLevelQueryState;
  readonly variants: readonly StockVariantOption[];
}

const NUMBER_FORMATTER = new Intl.NumberFormat('vi-VN');

export function InventoryStockView({
  error = null,
  levels,
  loading = false,
  locations,
  onCommand,
  onQueryChange,
  pagination,
  query,
  variants,
}: InventoryStockViewProps) {
  const [activeCommand, setActiveCommand] = useState<StockCommandKind | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const columns: readonly BackofficeDataColumn<InventoryStockLevel>[] = [
    {
      key: 'item',
      label: 'Phụ kiện',
      mobileRole: 'primary',
      render: (level) => (
        <div className={styles.identity}>
          <strong>{level.product?.name ?? 'Phụ kiện'}</strong>
          <span>{level.variant.displayName}</span>
          <small>{level.variant.sku}</small>
        </div>
      ),
    },
    {
      key: 'location',
      label: 'Địa điểm',
      render: (level) => level.location.name,
    },
    {
      align: 'end',
      key: 'onHand',
      label: 'Tồn thực',
      render: (level) => number(level.quantityOnHand),
    },
    {
      align: 'end',
      key: 'reserved',
      label: 'Đang giữ',
      render: (level) => number(level.quantityReserved),
    },
    {
      align: 'end',
      key: 'available',
      label: 'Có thể bán',
      render: (level) => (
        <strong className={styles.available}>{number(level.quantityAvailable)}</strong>
      ),
    },
    {
      align: 'end',
      key: 'threshold',
      label: 'Ngưỡng cảnh báo',
      render: (level) => number(level.reorderThreshold),
    },
    {
      key: 'status',
      label: 'Tình trạng',
      render: (level) => <StockLevelChip level={level} />,
    },
  ];

  function openCommand(kind: StockCommandKind) {
    setSuccessMessage(null);
    setActiveCommand(kind);
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Kho hàng · Phụ kiện</p>
          <h1>Tồn phụ kiện</h1>
          <p>Theo dõi số lượng thực tế, đang giữ và có thể bán tại từng địa điểm.</p>
        </div>
        <Link className={styles.secondaryAction} href="/backoffice/inventory/stock/movements">
          <ClockCounterClockwiseIcon aria-hidden="true" size={19} />
          Xem lịch sử kho
        </Link>
      </header>

      <section className={styles.commandBar} aria-label="Thao tác tồn phụ kiện">
        <div>
          <strong>Cập nhật tồn bằng thao tác có lịch sử</strong>
          <span>Số lượng không thể sửa trực tiếp trên bảng.</span>
        </div>
        <div className={styles.commandActions}>
          <Button
            iconLeading={<PackageIcon aria-hidden="true" size={18} />}
            size="compact"
            onClick={() => {
              openCommand('receive');
            }}
          >
            Nhận hàng
          </Button>
          <Button
            iconLeading={<ArrowsLeftRightIcon aria-hidden="true" size={18} />}
            size="compact"
            variant="secondary"
            onClick={() => {
              openCommand('transfer');
            }}
          >
            Chuyển kho
          </Button>
          <Button
            iconLeading={<SlidersHorizontalIcon aria-hidden="true" size={18} />}
            size="compact"
            variant="secondary"
            onClick={() => {
              openCommand('adjust');
            }}
          >
            Điều chỉnh
          </Button>
          <Button
            iconLeading={<ArrowUDownLeftIcon aria-hidden="true" size={18} />}
            size="compact"
            variant="secondary"
            onClick={() => {
              openCommand('return');
            }}
          >
            Hoàn kho
          </Button>
        </div>
      </section>

      <section className={styles.filters} aria-label="Bộ lọc tồn phụ kiện">
        <Select
          id="stock-variant-filter"
          label="Phụ kiện"
          value={query.variantId ?? ''}
          onChange={(event) => {
            onQueryChange({ page: 1, variantId: event.target.value || undefined });
          }}
        >
          <option value="">Tất cả phụ kiện</option>
          {variants.map((variant) => (
            <option key={variant.id} value={variant.id}>
              {variant.productName} · {variant.displayName}
            </option>
          ))}
        </Select>
        <Select
          id="stock-location-filter"
          label="Địa điểm"
          value={query.locationId ?? ''}
          onChange={(event) => {
            onQueryChange({ locationId: event.target.value || undefined, page: 1 });
          }}
        >
          <option value="">Tất cả địa điểm</option>
          {locations.map((location) => (
            <option key={location.id} value={location.id}>
              {location.name}
            </option>
          ))}
        </Select>
        <Select
          id="stock-alert-filter"
          label="Mức tồn"
          value={query.lowStock === undefined ? '' : String(query.lowStock)}
          onChange={(event) => {
            onQueryChange({
              lowStock: event.target.value === '' ? undefined : event.target.value === 'true',
              page: 1,
            });
          }}
        >
          <option value="">Tất cả mức tồn</option>
          <option value="true">Sắp hết hoặc đã hết</option>
          <option value="false">Đủ hàng</option>
        </Select>
      </section>

      {error === null ? null : (
        <InlineAlert title="Chưa tải được tồn phụ kiện" tone="danger">
          {error}
        </InlineAlert>
      )}
      {successMessage === null ? null : (
        <InlineAlert title="Đã cập nhật tồn kho" tone="success">
          {successMessage}
        </InlineAlert>
      )}

      <p className={styles.resultSummary} role="status">
        {loading && levels.length > 0
          ? 'Đang đối chiếu số lượng mới nhất…'
          : `${String(pagination.totalItems)} dòng tồn phù hợp`}
      </p>

      <div className={boardStyles.board}>
        <BackofficeDataBoard
          ariaLabel="Danh sách tồn phụ kiện"
          columns={columns}
          emptyDescription="Thay đổi bộ lọc hoặc dùng thao tác nhận hàng để ghi nhận lô mới."
          emptyTitle="Chưa có dòng tồn phù hợp"
          getRowKey={(level) => level.id}
          loading={loading}
          rows={levels}
        />
      </div>

      <div
        onClick={(event) => {
          handlePaginationClick(event, onQueryChange);
        }}
      >
        <BackofficePagination
          buildHref={(page) => buildStockLevelHref(query, { page })}
          page={pagination.page}
          pageSize={pagination.pageSize}
          totalItems={pagination.totalItems}
          totalPages={pagination.totalPages}
        />
      </div>

      <StockCommandDialog
        command={activeCommand}
        locations={locations}
        variants={variants}
        {...(query.locationId === undefined ? {} : { defaultLocationId: query.locationId })}
        {...(query.variantId === undefined ? {} : { defaultVariantId: query.variantId })}
        onClose={() => {
          setActiveCommand(null);
        }}
        onCommand={async (request) => {
          const outcome = await onCommand(request);
          if (outcome.ok) {
            setSuccessMessage(`${stockCommandLabel(request.kind)} đã được ghi vào lịch sử kho.`);
            setActiveCommand(null);
          }
          return outcome;
        }}
      />
    </div>
  );
}

interface StockCommandDialogProps {
  readonly command: StockCommandKind | null;
  readonly defaultLocationId?: string | undefined;
  readonly defaultVariantId?: string | undefined;
  readonly locations: readonly InventoryLocation[];
  readonly onClose: () => void;
  readonly onCommand: (request: StockCommandRequest) => Promise<StockCommandOutcome>;
  readonly variants: readonly StockVariantOption[];
}

function StockCommandDialog({
  command,
  defaultLocationId,
  defaultVariantId,
  locations,
  onClose,
  onCommand,
  variants,
}: StockCommandDialogProps) {
  const [draft, setDraft] = useState<StockCommandDraft>(() => emptyStockCommandDraft());
  const [errors, setErrors] = useState<Partial<Record<StockCommandField, string>>>({});
  const [pending, setPending] = useState(false);
  const [commandError, setCommandError] = useState<string | null>(null);

  useEffect(() => {
    if (command === null) return;
    setDraft(
      emptyStockCommandDraft({
        ...(defaultVariantId === undefined ? {} : { variantId: defaultVariantId }),
        ...(defaultLocationId === undefined ? {} : { locationId: defaultLocationId }),
      }),
    );
    setErrors({});
    setCommandError(null);
  }, [command, defaultLocationId, defaultVariantId]);

  const { dialogRef, onDialogClose } = useModalDialogLifecycle(command !== null);

  async function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (command === null || pending) return;
    const validation = validateStockCommand(command, draft);
    setErrors(validation.errors);
    if (validation.command === undefined) return;
    setPending(true);
    setCommandError(null);
    try {
      const outcome = await onCommand(validation.command);
      if (!outcome.ok) setCommandError(outcome.message);
    } catch {
      setCommandError('Không thể kết nối để cập nhật tồn kho.');
    } finally {
      setPending(false);
    }
  }

  const title = command === null ? 'Cập nhật tồn kho' : stockCommandLabel(command);
  return (
    <dialog
      aria-labelledby="stock-command-title"
      className={styles.commandDialog}
      ref={dialogRef}
      onClose={onDialogClose}
      onCancel={(event) => {
        event.preventDefault();
        if (!pending) onClose();
      }}
    >
      <form onSubmit={(event) => void submit(event)}>
        <header className={styles.dialogHeader}>
          <p>Thao tác có ghi lịch sử</p>
          <h2 id="stock-command-title">{title}</h2>
          <span>{commandDescription(command)}</span>
        </header>

        <div className={styles.dialogFields}>
          <Select
            error={errors.variantId}
            id="stock-command-variant"
            label="Phụ kiện"
            required
            value={draft.variantId}
            onChange={(event) => {
              setDraft((current) => ({ ...current, variantId: event.target.value }));
            }}
          >
            <option value="">Chọn phụ kiện</option>
            {variants.map((variant) => (
              <option key={variant.id} value={variant.id}>
                {variant.productName} · {variant.displayName}
              </option>
            ))}
          </Select>

          {command === 'transfer' ? (
            <>
              <LocationSelect
                error={errors.fromLocationId}
                id="stock-command-from"
                label="Xuất từ"
                locations={locations}
                value={draft.fromLocationId}
                onChange={(value) => {
                  setDraft((current) => ({ ...current, fromLocationId: value }));
                }}
              />
              <LocationSelect
                error={errors.toLocationId}
                id="stock-command-to"
                label="Chuyển đến"
                locations={locations}
                value={draft.toLocationId}
                onChange={(value) => {
                  setDraft((current) => ({ ...current, toLocationId: value }));
                }}
              />
            </>
          ) : (
            <LocationSelect
              error={errors.locationId}
              id="stock-command-location"
              label={command === 'receive' ? 'Nhận tại' : 'Địa điểm'}
              locations={locations}
              value={draft.locationId}
              onChange={(value) => {
                setDraft((current) => ({ ...current, locationId: value }));
              }}
            />
          )}

          {command === 'adjust' ? (
            <Select
              id="stock-command-direction"
              label="Hướng điều chỉnh"
              value={draft.direction}
              onChange={(event) => {
                setDraft((current) => ({
                  ...current,
                  direction: event.target.value as 'IN' | 'OUT',
                }));
              }}
            >
              <option value="IN">Tăng tồn</option>
              <option value="OUT">Giảm tồn</option>
            </Select>
          ) : null}

          <Input
            error={errors.quantity}
            id="stock-command-quantity"
            inputMode="numeric"
            label="Số lượng"
            min={1}
            required
            step={1}
            type="number"
            value={draft.quantity}
            onChange={(event) => {
              setDraft((current) => ({ ...current, quantity: event.target.value }));
            }}
          />

          {command === 'return' ? (
            <>
              <Select
                error={errors.referenceType}
                id="stock-command-reference-type"
                label="Nguồn hàng hoàn"
                required
                value={draft.referenceType}
                onChange={(event) => {
                  setDraft((current) => ({
                    ...current,
                    referenceType: event.target.value as StockCommandDraft['referenceType'],
                  }));
                }}
              >
                <option value="">Chọn nguồn</option>
                <option value="SHIPMENT">Đơn giao hàng</option>
                <option value="AFTER_SALES_REQUEST">Phiếu hỗ trợ sau mua</option>
              </Select>
              <Input
                error={errors.referenceId}
                hint="Dùng mã hệ thống từ đơn giao hàng hoặc phiếu hỗ trợ."
                id="stock-command-reference-id"
                label="Mã tham chiếu"
                required
                value={draft.referenceId}
                onChange={(event) => {
                  setDraft((current) => ({ ...current, referenceId: event.target.value }));
                }}
              />
            </>
          ) : null}
        </div>

        <Textarea
          error={errors.reason}
          hint={
            command === 'receive' || command === 'transfer'
              ? 'Không bắt buộc. Nếu nhập, cần từ 5 đến 500 ký tự.'
              : 'Bắt buộc, từ 5 đến 500 ký tự.'
          }
          id="stock-command-reason"
          label="Lý do"
          maxLength={500}
          required={command === 'adjust' || command === 'return'}
          rows={3}
          value={draft.reason}
          onChange={(event) => {
            setDraft((current) => ({ ...current, reason: event.target.value }));
          }}
        />

        {commandError === null ? null : (
          <InlineAlert title="Chưa thể cập nhật tồn kho" tone="danger">
            {commandError}
          </InlineAlert>
        )}

        <footer className={styles.dialogActions}>
          <Button disabled={pending} type="button" variant="secondary" onClick={onClose}>
            Hủy
          </Button>
          <Button loading={pending} loadingLabel="Đang cập nhật tồn kho" type="submit">
            Xác nhận {title.toLocaleLowerCase('vi-VN')}
          </Button>
        </footer>
      </form>
    </dialog>
  );
}

function LocationSelect({
  error,
  id,
  label,
  locations,
  onChange,
  value,
}: Readonly<{
  error?: string | undefined;
  id: string;
  label: string;
  locations: readonly InventoryLocation[];
  onChange: (value: string) => void;
  value: string;
}>) {
  return (
    <Select
      error={error}
      id={id}
      label={label}
      required
      value={value}
      onChange={(event) => {
        onChange(event.target.value);
      }}
    >
      <option value="">Chọn địa điểm</option>
      {locations
        .filter((location) => location.status === 'ACTIVE')
        .map((location) => (
          <option key={location.id} value={location.id}>
            {location.name}
          </option>
        ))}
    </Select>
  );
}

function StockLevelChip({ level }: Readonly<{ level: InventoryStockLevel }>) {
  const presentation = stockLevelPresentation(level.quantityAvailable, level.lowStock);
  return <StatusChip label={presentation.label} tone={presentation.tone} />;
}

function commandDescription(command: StockCommandKind | null): string {
  if (command === 'receive') return 'Ghi nhận lô phụ kiện vừa được tiếp nhận.';
  if (command === 'transfer') return 'Trừ tại nơi xuất và cộng tại nơi nhận trong cùng thao tác.';
  if (command === 'adjust') return 'Dùng khi kiểm đếm thực tế khác với số liệu đang ghi nhận.';
  if (command === 'return') return 'Chỉ hoàn hàng đã được kiểm tra từ đơn giao hoặc phiếu hỗ trợ.';
  return '';
}

function number(value: number): string {
  return NUMBER_FORMATTER.format(value);
}

function handlePaginationClick(
  event: MouseEvent<HTMLDivElement>,
  onQueryChange: InventoryStockViewProps['onQueryChange'],
) {
  if (event.button !== 0 || event.metaKey || event.ctrlKey) return;
  const target = (event.target as HTMLElement).closest<HTMLAnchorElement>('a[href]');
  if (target === null) return;
  const page = Number(new URL(target.href).searchParams.get('page') ?? '1');
  if (!Number.isSafeInteger(page) || page < 1) return;
  event.preventDefault();
  onQueryChange({ page });
}
