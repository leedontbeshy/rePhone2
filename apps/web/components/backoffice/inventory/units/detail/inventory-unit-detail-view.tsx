'use client';

import {
  ArrowLeftIcon,
  ArrowClockwiseIcon,
  CheckCircleIcon,
  ImageSquareIcon,
  LockKeyIcon,
  ShieldCheckIcon,
} from '@phosphor-icons/react/ssr';
import Link from 'next/link';
import { useEffect, useMemo, useState, type ChangeEvent, type SyntheticEvent } from 'react';
import {
  BackofficeActionDialog,
  inspectionResultPresentation,
  inspectionStatusPresentation,
  inspectionTypeLabel,
  inventoryLifecyclePresentation,
} from '@/components/backoffice';
import {
  DisclosureSummary,
  Button,
  FilePicker,
  InlineAlert,
  Input,
  Select,
  StatusChip,
  Textarea,
  formatVnd,
} from '@/components/ui';
import { useModalDialogLifecycle } from '@/components/ui/modal-dialog-lifecycle';
import {
  validateInventoryMediaFile,
  type EphemeralInventoryIdentifiers,
  type InventoryInspectionSummary,
  type InventoryInspectionType,
  type InventoryLocation,
  type InventoryMediaUploadInput,
  type InventoryUnitAction,
  type InventoryUnitDetail,
  type UpdateInventoryUnitInput,
} from '@/lib/backoffice-inventory-api';
import {
  buildIdentifierCorrection,
  buildInventoryUnitUpdate,
  emptyIdentifierCorrectionDraft,
  inventoryUnitEditDraft,
  readinessReasonLabel,
  visibleLifecycleActions,
  type InventoryIdentifierCorrectionDraft,
  type InventoryIdentifierCorrectionField,
  type InventoryUnitEditDraft,
  type InventoryUnitUpdateField,
} from './inventory-unit-detail-model';
import styles from './inventory-unit-detail.module.css';

export type InventoryLifecycleCommand = Extract<
  InventoryUnitAction,
  'MAKE_AVAILABLE' | 'SEND_TO_REPAIR' | 'QUARANTINE' | 'WRITE_OFF' | 'TRANSFER'
>;

export interface InventoryUnitDetailViewProps {
  readonly busyAction?: string | null;
  readonly error?: string | null;
  readonly identifiers?: EphemeralInventoryIdentifiers | null;
  readonly inspections: readonly InventoryInspectionSummary[];
  readonly locations: readonly InventoryLocation[];
  readonly notice?: string | null;
  readonly onClearIdentifiers: () => void;
  readonly onCreateInspection: (inspectionType: InventoryInspectionType) => Promise<boolean>;
  readonly onLifecycleCommand: (
    action: InventoryLifecycleCommand,
    input?: { readonly reason?: string; readonly toLocationId?: string },
  ) => Promise<boolean>;
  readonly onRevealIdentifiers: (reason: string) => Promise<boolean>;
  readonly onRefresh: () => Promise<void>;
  readonly onUpdate: (input: UpdateInventoryUnitInput) => Promise<boolean>;
  readonly onUpload: (input: InventoryMediaUploadInput) => Promise<boolean>;
  readonly unit: InventoryUnitDetail;
}

const IDENTIFIER_LABELS = {
  EID: 'EID',
  IMEI_1: 'IMEI chính',
  IMEI_2: 'IMEI phụ',
  SERIAL: 'Số sê-ri',
} as const;

const FULL_IDENTIFIER_LABELS: Readonly<Record<keyof EphemeralInventoryIdentifiers, string>> = {
  eid: 'EID',
  imei1: 'IMEI chính',
  imei2: 'IMEI phụ',
  serial: 'Số sê-ri',
};

const ACTION_PRESENTATION: Readonly<
  Record<
    InventoryLifecycleCommand,
    {
      readonly confirm: string;
      readonly description: string;
      readonly label: string;
      readonly title: string;
    }
  >
> = {
  MAKE_AVAILABLE: {
    confirm: 'Đưa lên bán',
    description:
      'Máy sẽ xuất hiện trong nguồn hàng có thể bán sau khi hệ thống kiểm tra lại điều kiện.',
    label: 'Đưa lên bán',
    title: 'Xác nhận đưa máy lên bán?',
  },
  SEND_TO_REPAIR: {
    confirm: 'Chuyển sửa chữa',
    description: 'Ghi rõ tình trạng cần xử lý để bộ phận kỹ thuật tiếp nhận đúng việc.',
    label: 'Chuyển sửa chữa',
    title: 'Chuyển máy sang sửa chữa?',
  },
  QUARANTINE: {
    confirm: 'Cách ly máy',
    description: 'Máy sẽ được tách khỏi luồng bán trong khi chờ kiểm tra hoặc xử lý.',
    label: 'Cách ly',
    title: 'Cách ly máy này?',
  },
  WRITE_OFF: {
    confirm: 'Loại khỏi kho',
    description: 'Đây là trạng thái kết thúc. Hãy kiểm tra kỹ hồ sơ và ghi rõ lý do.',
    label: 'Loại khỏi kho',
    title: 'Loại máy khỏi kho?',
  },
  TRANSFER: {
    confirm: 'Chuyển địa điểm',
    description: 'Chọn nơi nhận máy và ghi chú nếu cần bàn giao thêm thông tin.',
    label: 'Chuyển địa điểm',
    title: 'Chuyển máy sang địa điểm khác',
  },
};

export function InventoryUnitDetailView({
  busyAction = null,
  error = null,
  identifiers = null,
  inspections,
  locations,
  notice = null,
  onClearIdentifiers,
  onCreateInspection,
  onLifecycleCommand,
  onRevealIdentifiers,
  onRefresh,
  onUpdate,
  onUpload,
  unit,
}: InventoryUnitDetailViewProps) {
  const lifecycle = inventoryLifecyclePresentation(unit.lifecycleStatus);
  const lifecycleActions = visibleLifecycleActions(unit.availableActions);
  const [dialogAction, setDialogAction] = useState<InventoryLifecycleCommand | null>(null);
  const [commandReason, setCommandReason] = useState('');
  const [revealOpen, setRevealOpen] = useState(false);
  const [revealReason, setRevealReason] = useState('');

  async function confirmLifecycleCommand(reason?: string) {
    if (dialogAction === null || dialogAction === 'TRANSFER') return;
    const succeeded = await onLifecycleCommand(
      dialogAction,
      reason === undefined ? undefined : { reason },
    );
    if (succeeded) {
      setDialogAction(null);
      setCommandReason('');
    }
  }

  async function confirmReveal(reason?: string) {
    if (reason === undefined) return;
    const succeeded = await onRevealIdentifiers(reason);
    if (succeeded) {
      setRevealOpen(false);
      setRevealReason('');
    }
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <Link className={styles.backLink} href="/backoffice/inventory/units">
            <ArrowLeftIcon aria-hidden="true" size={18} />
            Danh sách máy
          </Link>
          <p className={styles.eyebrow}>Hồ sơ máy vật lý</p>
          <div className={styles.titleLine}>
            <h1>{unit.product.name}</h1>
            <StatusChip label={lifecycle.label} tone={lifecycle.tone} />
          </div>
          <p>
            {unit.variant.displayName} · <span className={styles.mono}>{unit.inventoryCode}</span>
          </p>
        </div>
        <div className={styles.headerAside}>
          <Button
            iconLeading={<ArrowClockwiseIcon aria-hidden="true" size={18} />}
            loading={busyAction === 'refresh'}
            loadingLabel="Đang tải lại hồ sơ"
            size="compact"
            variant="secondary"
            onClick={() => void onRefresh()}
          >
            Tải lại hồ sơ
          </Button>
          <dl className={styles.headerFacts}>
            <div>
              <dt>Địa điểm</dt>
              <dd>{unit.location.name}</dd>
            </div>
            <div>
              <dt>Giá bán</dt>
              <dd>{unit.salePrice === null ? 'Chưa đặt' : formatVnd(unit.salePrice)}</dd>
            </div>
            <div>
              <dt>Ngày tiếp nhận</dt>
              <dd>{formatDate(unit.receivedAt)}</dd>
            </div>
          </dl>
        </div>
      </header>

      {error === null ? null : (
        <InlineAlert role="alert" title="Chưa thể hoàn tất" tone="danger">
          {error}
        </InlineAlert>
      )}
      {notice === null ? null : (
        <InlineAlert title="Đã cập nhật" tone="success">
          {notice}
        </InlineAlert>
      )}

      <div className={styles.workspace}>
        <div className={styles.mainColumn}>
          <MediaSection busy={busyAction === 'upload'} unit={unit} onUpload={onUpload} />
          <UnitInformationForm busy={busyAction === 'update'} unit={unit} onUpdate={onUpdate} />
          <IdentifierSection
            busy={busyAction === 'update'}
            identifiers={identifiers}
            unit={unit}
            onClearIdentifiers={onClearIdentifiers}
            onOpenReveal={() => {
              setRevealOpen(true);
            }}
            onUpdate={onUpdate}
          />
          <InspectionHistory
            busy={busyAction === 'create-inspection'}
            inspections={inspections}
            unit={unit}
            onCreateInspection={onCreateInspection}
          />
        </div>

        <aside className={styles.sideColumn} aria-label="Điều kiện và thao tác máy">
          <ReadinessCard unit={unit} />
          <section className={styles.card}>
            <div className={styles.sectionHeading}>
              <p className={styles.eyebrow}>Thao tác hiện có</p>
              <h2>Xử lý máy</h2>
              <p>Danh sách này được cập nhật theo trạng thái thực tế của máy.</p>
            </div>
            {lifecycleActions.length === 0 ? (
              <p className={styles.emptyCopy}>Hiện không có thao tác chuyển trạng thái phù hợp.</p>
            ) : (
              <div className={styles.actionRail}>
                {lifecycleActions.map((action) => (
                  <Button
                    data-inventory-action={action}
                    disabled={busyAction !== null}
                    key={action}
                    variant={
                      action === 'WRITE_OFF'
                        ? 'destructive'
                        : action === 'MAKE_AVAILABLE'
                          ? 'primary'
                          : 'secondary'
                    }
                    onClick={() => {
                      setCommandReason('');
                      setDialogAction(action);
                    }}
                  >
                    {ACTION_PRESENTATION[action].label}
                  </Button>
                ))}
              </div>
            )}
          </section>
        </aside>
      </div>

      <BackofficeActionDialog
        confirmLabel="Xem mã đầy đủ"
        description="Mã đầy đủ chỉ hiển thị tạm thời trên màn hình này. Lý do được lưu để kiểm soát truy cập."
        open={revealOpen}
        pending={busyAction === 'reveal'}
        reason={{
          hint: 'Nêu mục đích đối chiếu, tối thiểu 5 ký tự. Nội dung sẽ được ghi nhận.',
          label: 'Lý do xem mã',
          onChange: setRevealReason,
          value: revealReason,
        }}
        title="Xem mã định danh đầy đủ?"
        onCancel={() => {
          if (busyAction !== 'reveal') {
            setRevealOpen(false);
            setRevealReason('');
          }
        }}
        onConfirm={(reason) => {
          void confirmReveal(reason);
        }}
      />

      {dialogAction !== null && dialogAction !== 'TRANSFER' ? (
        <BackofficeActionDialog
          confirmLabel={ACTION_PRESENTATION[dialogAction].confirm}
          description={ACTION_PRESENTATION[dialogAction].description}
          destructive={dialogAction === 'WRITE_OFF' || dialogAction === 'QUARANTINE'}
          open
          pending={busyAction === `command:${dialogAction}`}
          {...(dialogAction === 'MAKE_AVAILABLE'
            ? {}
            : { reason: { onChange: setCommandReason, value: commandReason } })}
          title={ACTION_PRESENTATION[dialogAction].title}
          onCancel={() => {
            if (busyAction === null) {
              setDialogAction(null);
              setCommandReason('');
            }
          }}
          onConfirm={(reason) => {
            void confirmLifecycleCommand(reason);
          }}
        />
      ) : null}

      <TransferDialog
        currentLocationId={unit.location.id}
        locations={locations}
        open={dialogAction === 'TRANSFER'}
        pending={busyAction === 'command:TRANSFER'}
        onCancel={() => {
          if (busyAction === null) setDialogAction(null);
        }}
        onConfirm={async (toLocationId, reason) => {
          const succeeded = await onLifecycleCommand('TRANSFER', {
            toLocationId,
            ...(reason === undefined ? {} : { reason }),
          });
          if (succeeded) setDialogAction(null);
        }}
      />
    </div>
  );
}

function MediaSection({
  busy,
  onUpload,
  unit,
}: Readonly<{
  busy: boolean;
  onUpload: InventoryUnitDetailViewProps['onUpload'];
  unit: InventoryUnitDetail;
}>) {
  const [selectedId, setSelectedId] = useState<string | null>(unit.media[0]?.id ?? null);
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [altText, setAltText] = useState('');
  const [sortOrder, setSortOrder] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [fileInputKey, setFileInputKey] = useState(0);
  const selected = unit.media.find((media) => media.id === selectedId) ?? unit.media[0] ?? null;
  const canUpload = unit.availableActions.includes('UPLOAD_MEDIA');

  useEffect(() => {
    setSelectedId((current) =>
      unit.media.some((media) => media.id === current) ? current : (unit.media[0]?.id ?? null),
    );
  }, [unit.media]);

  async function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setFileError(null);
    if (file === null) {
      setFileError('Chọn một ảnh trước khi tải lên.');
      return;
    }
    const normalizedOrder = sortOrder.trim();
    const parsedOrder = normalizedOrder === '' ? undefined : Number(normalizedOrder);
    if (parsedOrder !== undefined && (!Number.isSafeInteger(parsedOrder) || parsedOrder < 0)) {
      setFormError('Thứ tự ảnh phải là số nguyên từ 0 trở lên.');
      return;
    }
    const succeeded = await onUpload({
      altText,
      file,
      ...(parsedOrder === undefined ? {} : { sortOrder: parsedOrder }),
    });
    if (succeeded) {
      setFile(null);
      setFileError(null);
      setAltText('');
      setSortOrder('');
      setFileInputKey((current) => current + 1);
    }
  }

  return (
    <section className={styles.card}>
      <div className={styles.sectionHeading}>
        <p className={styles.eyebrow}>Ảnh thực tế</p>
        <h2>Hình ảnh của máy</h2>
        <p>Ảnh đã lưu vẫn xuất hiện đầy đủ sau khi tải lại hồ sơ.</p>
      </div>
      <div className={styles.mediaLayout}>
        <div className={styles.mediaStage}>
          {selected === null ? (
            <div
              className={styles.mediaPlaceholder}
              role="img"
              aria-label="Máy chưa có ảnh thực tế"
            >
              <ImageSquareIcon aria-hidden="true" size={42} />
              <span>Chưa có ảnh thực tế</span>
            </div>
          ) : (
            <img alt={selected.altText?.trim() || `Ảnh ${unit.inventoryCode}`} src={selected.url} />
          )}
        </div>
        {unit.media.length > 0 ? (
          <div className={styles.thumbnails} aria-label="Các ảnh của máy">
            {unit.media.map((media, index) => (
              <button
                aria-label={`Xem ảnh ${String(index + 1)}`}
                aria-pressed={selected?.id === media.id}
                className={styles.thumbnail}
                key={media.id}
                type="button"
                onClick={() => {
                  setSelectedId(media.id);
                }}
              >
                <img alt="" src={media.url} />
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {canUpload ? (
        <form className={styles.uploadForm} noValidate onSubmit={(event) => void submit(event)}>
          <FilePicker
            accept="image/jpeg,image/png,image/webp"
            buttonLabel="Chọn ảnh"
            disabled={busy}
            emptyLabel="Chưa chọn ảnh"
            error={fileError}
            hint="Dùng ảnh JPG, PNG hoặc WebP; tối đa 8 MB."
            id="unit-media-file"
            key={fileInputKey}
            label="Ảnh tải lên"
            required
            selectedFileName={file?.name ?? null}
            onChange={(event: ChangeEvent<HTMLInputElement>) => {
              const selectedFile = event.target.files?.[0] ?? null;
              const validationMessage =
                selectedFile === null ? null : validateInventoryMediaFile(selectedFile);
              setFile(validationMessage === null ? selectedFile : null);
              setFileError(validationMessage);
              setFormError(null);
            }}
          />
          <Input
            disabled={busy}
            id="unit-media-alt"
            label="Mô tả ảnh"
            maxLength={255}
            placeholder="Ví dụ: Mặt trước máy"
            value={altText}
            onChange={(event) => {
              setAltText(event.target.value);
            }}
          />
          <Input
            disabled={busy}
            id="unit-media-order"
            inputMode="numeric"
            label="Thứ tự"
            min={0}
            placeholder="0"
            type="number"
            value={sortOrder}
            onChange={(event) => {
              setSortOrder(event.target.value);
            }}
          />
          <div className={styles.formAction}>
            {formError === null ? null : <p className={styles.formError}>{formError}</p>}
            <Button loading={busy} loadingLabel="Đang tải ảnh" type="submit">
              Tải ảnh lên
            </Button>
          </div>
        </form>
      ) : null}
    </section>
  );
}

function UnitInformationForm({
  busy,
  onUpdate,
  unit,
}: Readonly<{
  busy: boolean;
  onUpdate: InventoryUnitDetailViewProps['onUpdate'];
  unit: InventoryUnitDetail;
}>) {
  const [draft, setDraft] = useState<InventoryUnitEditDraft>(() => inventoryUnitEditDraft(unit));
  const [errors, setErrors] = useState<Partial<Record<InventoryUnitUpdateField, string>>>({});

  useEffect(() => {
    setDraft(inventoryUnitEditDraft(unit));
    setErrors({});
  }, [unit.id, unit.updatedAt]);

  function update<Key extends keyof InventoryUnitEditDraft>(
    key: Key,
    value: InventoryUnitEditDraft[Key],
  ) {
    setDraft((current) => ({ ...current, [key]: value }));
    setErrors({});
  }

  async function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = buildInventoryUnitUpdate(unit, draft);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    await onUpdate(result.input);
  }

  return (
    <section className={styles.card}>
      <div className={styles.sectionHeading}>
        <p className={styles.eyebrow}>Thông tin bán hàng</p>
        <h2>Thông tin máy</h2>
        <p>Cập nhật thông tin kỹ thuật và giá áp dụng riêng cho chiếc máy này.</p>
      </div>
      <form className={styles.formGrid} onSubmit={(event) => void submit(event)}>
        <Input
          disabled={busy}
          error={errors.modelNumber}
          id="unit-model-number"
          label="Mã kiểu máy"
          maxLength={255}
          placeholder="Ví dụ: A2890"
          value={draft.modelNumber}
          onChange={(event) => {
            update('modelNumber', event.target.value);
          }}
        />
        <Input
          disabled={busy}
          error={errors.regionCode}
          id="unit-region-code"
          label="Mã thị trường"
          maxLength={255}
          placeholder="Ví dụ: VN/A"
          value={draft.regionCode}
          onChange={(event) => {
            update('regionCode', event.target.value);
          }}
        />
        <Select
          disabled={busy}
          id="unit-sim-lock"
          label="Tình trạng mạng"
          value={draft.simLockStatus}
          onChange={(event) => {
            update('simLockStatus', event.target.value as InventoryUnitEditDraft['simLockStatus']);
          }}
        >
          <option value="UNLOCKED">Không khóa mạng</option>
          <option value="CARRIER_LOCKED">Khóa theo nhà mạng</option>
          <option value="UNKNOWN">Chưa xác định</option>
        </Select>
        <Input
          disabled={busy}
          error={errors.carrierName}
          id="unit-carrier-name"
          label="Nhà mạng"
          maxLength={255}
          placeholder="Để trống nếu không áp dụng"
          value={draft.carrierName}
          onChange={(event) => {
            update('carrierName', event.target.value);
          }}
        />
        <Select
          disabled={busy}
          id="unit-sim-configuration"
          label="Cấu hình SIM"
          value={draft.simConfiguration}
          onChange={(event) => {
            update(
              'simConfiguration',
              event.target.value as InventoryUnitEditDraft['simConfiguration'],
            );
          }}
        >
          <option value="SINGLE_PHYSICAL">1 SIM vật lý</option>
          <option value="DUAL_PHYSICAL">2 SIM vật lý</option>
          <option value="PHYSICAL_AND_ESIM">SIM vật lý và eSIM</option>
          <option value="ESIM_ONLY">Chỉ eSIM</option>
          <option value="UNKNOWN">Chưa xác định</option>
        </Select>
        <Input
          disabled={busy}
          error={errors.warrantyDaysOverride}
          id="unit-warranty-days"
          inputMode="numeric"
          label="Bảo hành riêng (ngày)"
          max={3650}
          min={0}
          placeholder="Theo chính sách mặc định"
          type="number"
          value={draft.warrantyDaysOverride}
          onChange={(event) => {
            update('warrantyDaysOverride', event.target.value);
          }}
        />
        <Input
          disabled={busy}
          error={errors.salePrice}
          id="unit-sale-price"
          inputMode="numeric"
          label="Giá bán"
          maxLength={15}
          placeholder="Ví dụ: 12500000"
          value={draft.salePrice}
          onChange={(event) => {
            update('salePrice', event.target.value);
          }}
        />
        <Input
          disabled={busy}
          error={errors.compareAtPrice}
          id="unit-compare-price"
          inputMode="numeric"
          label="Giá tham khảo"
          maxLength={15}
          placeholder="Ví dụ: 13900000"
          value={draft.compareAtPrice}
          onChange={(event) => {
            update('compareAtPrice', event.target.value);
          }}
        />
        <div className={styles.formFooter}>
          {errors.form === undefined ? null : <p className={styles.formError}>{errors.form}</p>}
          <Button loading={busy} loadingLabel="Đang lưu hồ sơ" type="submit">
            Lưu thông tin
          </Button>
        </div>
      </form>
    </section>
  );
}

function IdentifierSection({
  busy,
  identifiers,
  onClearIdentifiers,
  onOpenReveal,
  onUpdate,
  unit,
}: Readonly<{
  busy: boolean;
  identifiers: EphemeralInventoryIdentifiers | null;
  onClearIdentifiers: () => void;
  onOpenReveal: () => void;
  onUpdate: InventoryUnitDetailViewProps['onUpdate'];
  unit: InventoryUnitDetail;
}>) {
  const [draft, setDraft] = useState<InventoryIdentifierCorrectionDraft>(
    emptyIdentifierCorrectionDraft,
  );
  const [errors, setErrors] = useState<Partial<Record<InventoryIdentifierCorrectionField, string>>>(
    {},
  );

  function update<Key extends keyof InventoryIdentifierCorrectionDraft>(
    key: Key,
    value: InventoryIdentifierCorrectionDraft[Key],
  ) {
    setDraft((current) => ({ ...current, [key]: value }));
    setErrors({});
  }

  async function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = buildIdentifierCorrection(draft);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    const succeeded = await onUpdate(result.input);
    if (succeeded) {
      setDraft(emptyIdentifierCorrectionDraft());
      setErrors({});
    }
  }

  return (
    <section className={styles.card}>
      <div className={styles.sectionHeadingRow}>
        <div className={styles.sectionHeading}>
          <p className={styles.eyebrow}>Thông tin được bảo vệ</p>
          <h2>Mã định danh</h2>
          <p>Mặc định chỉ hiển thị phần đã che để hạn chế lộ thông tin thiết bị.</p>
        </div>
        <Button
          iconLeading={<LockKeyIcon aria-hidden="true" size={18} />}
          variant="secondary"
          onClick={onOpenReveal}
        >
          Xem mã đầy đủ
        </Button>
      </div>

      {unit.maskedIdentifiers.length === 0 ? (
        <p className={styles.emptyCopy}>Chưa có mã định danh.</p>
      ) : (
        <dl className={styles.identifierGrid}>
          {unit.maskedIdentifiers.map((identifier) => (
            <div key={identifier.type}>
              <dt>{IDENTIFIER_LABELS[identifier.type]}</dt>
              <dd>{identifier.maskedValue}</dd>
            </div>
          ))}
        </dl>
      )}

      {identifiers === null ? null : (
        <div className={styles.ephemeralIdentifiers} role="status">
          <div>
            <strong>Mã đầy đủ đang hiển thị tạm thời</strong>
            <p>Tự động ẩn sau một phút hoặc ngay khi rời trang.</p>
          </div>
          <dl>
            {(
              Object.entries(identifiers) as Array<
                [keyof EphemeralInventoryIdentifiers, string | null]
              >
            ).map(([key, value]) =>
              value === null ? null : (
                <div key={key}>
                  <dt>{FULL_IDENTIFIER_LABELS[key]}</dt>
                  <dd>{value}</dd>
                </div>
              ),
            )}
          </dl>
          <Button size="compact" variant="secondary" onClick={onClearIdentifiers}>
            Ẩn ngay
          </Button>
        </div>
      )}

      <details className={styles.correctionPanel}>
        <DisclosureSummary>Điều chỉnh mã bị nhập sai</DisclosureSummary>
        <p>Chỉ nhập mã mới cần thay thế. Hệ thống không điền lại mã đầy đủ hiện tại.</p>
        <form className={styles.formGrid} onSubmit={(event) => void submit(event)}>
          <Input
            disabled={busy}
            error={errors.imei1}
            id="unit-correct-imei-1"
            label="IMEI chính mới"
            maxLength={100}
            value={draft.imei1}
            onChange={(event) => {
              update('imei1', event.target.value);
            }}
          />
          <Input
            disabled={busy}
            error={errors.imei2}
            id="unit-correct-imei-2"
            label="IMEI phụ mới"
            maxLength={100}
            value={draft.imei2}
            onChange={(event) => {
              update('imei2', event.target.value);
            }}
          />
          <Input
            disabled={busy}
            error={errors.serial}
            id="unit-correct-serial"
            label="Số sê-ri mới"
            maxLength={100}
            value={draft.serial}
            onChange={(event) => {
              update('serial', event.target.value);
            }}
          />
          <Input
            disabled={busy}
            error={errors.eid}
            id="unit-correct-eid"
            label="EID mới"
            maxLength={100}
            value={draft.eid}
            onChange={(event) => {
              update('eid', event.target.value);
            }}
          />
          <Textarea
            disabled={busy}
            containerClassName={styles.fullSpan ?? ''}
            error={errors.reason}
            hint="Lý do được ghi nhận để đối chiếu sau này."
            id="unit-correct-reason"
            label="Lý do điều chỉnh"
            maxLength={500}
            minLength={5}
            required
            value={draft.reason}
            onChange={(event) => {
              update('reason', event.target.value);
            }}
          />
          <div className={styles.formFooter}>
            {errors.form === undefined ? null : <p className={styles.formError}>{errors.form}</p>}
            <Button loading={busy} loadingLabel="Đang lưu mã" type="submit" variant="secondary">
              Lưu điều chỉnh
            </Button>
          </div>
        </form>
      </details>
    </section>
  );
}

function InspectionHistory({
  busy,
  inspections,
  onCreateInspection,
  unit,
}: Readonly<{
  busy: boolean;
  inspections: readonly InventoryInspectionSummary[];
  onCreateInspection: InventoryUnitDetailViewProps['onCreateInspection'];
  unit: InventoryUnitDetail;
}>) {
  const [inspectionType, setInspectionType] = useState<InventoryInspectionType>('PRE_SALE');
  const canCreate = unit.availableActions.includes('CREATE_INSPECTION');

  return (
    <section className={styles.card}>
      <div className={styles.sectionHeadingRow}>
        <div className={styles.sectionHeading}>
          <p className={styles.eyebrow}>Lịch sử kỹ thuật</p>
          <h2>Phiếu kiểm định</h2>
          <p>Theo dõi các lần kiểm tra và người phụ trách từng phiếu.</p>
        </div>
        {canCreate ? (
          <form
            className={styles.inspectionCreate}
            onSubmit={(event) => {
              event.preventDefault();
              void onCreateInspection(inspectionType);
            }}
          >
            <Select
              disabled={busy}
              id="new-inspection-type"
              label="Loại kiểm định"
              value={inspectionType}
              onChange={(event) => {
                setInspectionType(event.target.value as InventoryInspectionType);
              }}
            >
              <option value="INTAKE">Nhập kho</option>
              <option value="RETURN">Hàng hoàn</option>
              <option value="WARRANTY">Bảo hành</option>
              <option value="PRE_SALE">Trước khi bán</option>
            </Select>
            <Button loading={busy} loadingLabel="Đang tạo phiếu" type="submit">
              Tạo phiếu
            </Button>
          </form>
        ) : null}
      </div>

      {inspections.length === 0 ? (
        <p className={styles.emptyCopy}>Máy chưa có phiếu kiểm định.</p>
      ) : (
        <div className={styles.inspectionList}>
          {inspections.map((inspection) => {
            const status = inspectionStatusPresentation(inspection.status);
            const result = inspectionResultPresentation(inspection.overallResult);
            return (
              <article className={styles.inspectionItem} key={inspection.id}>
                <div>
                  <strong>{inspectionTypeLabel(inspection.inspectionType)}</strong>
                  <span>
                    {inspection.inspector?.fullName ?? 'Chưa có tên người kiểm định'}
                    {inspection.inspector?.employeeCode
                      ? ` · ${inspection.inspector.employeeCode}`
                      : ''}
                  </span>
                </div>
                <div className={styles.inspectionChips}>
                  {inspection.isCurrent ? <StatusChip label="Hiện hành" tone="info" /> : null}
                  <StatusChip label={status.label} tone={status.tone} />
                  <StatusChip label={result.label} tone={result.tone} />
                </div>
                <time dateTime={inspection.inspectedAt ?? inspection.createdAt}>
                  {formatDateTime(inspection.inspectedAt ?? inspection.createdAt)}
                </time>
                <Link href={`/backoffice/inventory/inspections/${inspection.id}`}>
                  {inspection.status === 'DRAFT' ? 'Tiếp tục kiểm định' : 'Xem phiếu'}
                </Link>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

function ReadinessCard({ unit }: Readonly<{ unit: InventoryUnitDetail }>) {
  const readiness = unit.availabilityReadiness;
  return (
    <section className={styles.card}>
      <div className={styles.readinessHeading}>
        {readiness?.isReady ? (
          <CheckCircleIcon aria-hidden="true" size={24} weight="fill" />
        ) : (
          <ShieldCheckIcon aria-hidden="true" size={24} />
        )}
        <div>
          <h2>Điều kiện đưa lên bán</h2>
          <p>
            {readiness === null
              ? 'Trạng thái hiện tại không áp dụng bước kiểm tra này.'
              : readiness.isReady
                ? 'Máy đã đáp ứng các điều kiện hiện tại.'
                : 'Hoàn tất các mục dưới đây trước khi đưa máy lên bán.'}
          </p>
        </div>
      </div>
      {readiness !== null && readiness.reasons.length > 0 ? (
        <ul className={styles.readinessList}>
          {readiness.reasons.map((reason) => (
            <li key={reason}>{readinessReasonLabel(reason)}</li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function TransferDialog({
  currentLocationId,
  locations,
  onCancel,
  onConfirm,
  open,
  pending,
}: Readonly<{
  currentLocationId: string;
  locations: readonly InventoryLocation[];
  onCancel: () => void;
  onConfirm: (toLocationId: string, reason?: string) => Promise<void>;
  open: boolean;
  pending: boolean;
}>) {
  const candidates = useMemo(
    () =>
      locations.filter(
        (location) => location.status === 'ACTIVE' && location.id !== currentLocationId,
      ),
    [currentLocationId, locations],
  );
  const [toLocationId, setToLocationId] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setToLocationId(candidates[0]?.id ?? '');
    setReason('');
    setError(null);
  }, [candidates, open]);

  const { dialogRef, onDialogClose } = useModalDialogLifecycle(open);

  async function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedReason = reason.trim();
    if (toLocationId === '') {
      setError('Chọn địa điểm nhận máy.');
      return;
    }
    if (normalizedReason !== '' && normalizedReason.length < 5) {
      setError('Ghi chú cần ít nhất 5 ký tự hoặc để trống.');
      return;
    }
    setError(null);
    await onConfirm(toLocationId, normalizedReason || undefined);
  }

  return (
    <dialog
      aria-labelledby="transfer-unit-title"
      className={styles.dialog}
      ref={dialogRef}
      onClose={onDialogClose}
      onCancel={(event) => {
        event.preventDefault();
        if (!pending) onCancel();
      }}
    >
      <form onSubmit={(event) => void submit(event)}>
        <div className={styles.dialogHeading}>
          <p className={styles.eyebrow}>Bàn giao nội bộ</p>
          <h2 id="transfer-unit-title">{ACTION_PRESENTATION.TRANSFER.title}</h2>
          <p>{ACTION_PRESENTATION.TRANSFER.description}</p>
        </div>
        {candidates.length === 0 ? (
          <InlineAlert title="Chưa có nơi nhận" tone="warning">
            Không có địa điểm đang hoạt động khác để chuyển máy.
          </InlineAlert>
        ) : (
          <>
            <Select
              id="transfer-unit-location"
              label="Địa điểm nhận"
              required
              value={toLocationId}
              onChange={(event) => {
                setToLocationId(event.target.value);
                setError(null);
              }}
            >
              {candidates.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.name} · {location.code}
                </option>
              ))}
            </Select>
            <Textarea
              error={error}
              hint="Không bắt buộc. Nếu nhập, ghi ít nhất 5 ký tự."
              id="transfer-unit-reason"
              label="Ghi chú bàn giao"
              maxLength={500}
              value={reason}
              onChange={(event) => {
                setReason(event.target.value);
                setError(null);
              }}
            />
          </>
        )}
        <div className={styles.dialogActions}>
          <Button disabled={pending} type="button" variant="secondary" onClick={onCancel}>
            Hủy
          </Button>
          <Button
            disabled={candidates.length === 0}
            loading={pending}
            loadingLabel="Đang chuyển máy"
            type="submit"
          >
            Chuyển địa điểm
          </Button>
        </div>
      </form>
    </dialog>
  );
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium' }).format(date);
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('vi-VN', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date);
}
