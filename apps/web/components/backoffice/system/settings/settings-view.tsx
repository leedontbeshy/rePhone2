'use client';

import {
  ArrowSquareOutIcon,
  ArrowsClockwiseIcon,
  BankIcon,
  CheckCircleIcon,
  ClockIcon,
  FloppyDiskIcon,
  ImageSquareIcon,
  PencilSimpleIcon,
  ShieldCheckIcon,
  StorefrontIcon,
  TruckIcon,
  UploadSimpleIcon,
  WarningCircleIcon,
} from '@phosphor-icons/react';
import { useCallback, useEffect, useMemo, useRef, useState, type SyntheticEvent } from 'react';
import { useAuth } from '@/app/auth-provider';
import { BackofficeActionDialog } from '@/components/backoffice/backoffice-action-dialog';
import { Button, ErrorSummary, InlineAlert, Input, Skeleton, Textarea } from '@/components/ui';
import {
  getSettings,
  SystemAdminError,
  updateSettings,
  uploadBankQr,
  type StoreSettings,
} from '@/lib/system-admin-api';
import {
  changedSettingsFields,
  formatSettingsDays,
  formatSettingsDuration,
  formatSettingsMoney,
  hasSettingsChanges,
  settingsToDraft,
  validateQrFile,
  validateSettingsDraft,
  type SettingsDraft,
  type SettingsErrors,
  type SettingsField,
} from './settings-model';
import {
  createSystemAdminMutationLock,
  runSystemAdminMutation,
} from '../system-admin-mutation-lock';
import styles from './settings.module.css';

export function SettingsView() {
  const { client } = useAuth();
  const [settings, setSettings] = useState<StoreSettings>();
  const [draftBaseline, setDraftBaseline] = useState<StoreSettings>();
  const [draft, setDraft] = useState<SettingsDraft>();
  const [fieldErrors, setFieldErrors] = useState<SettingsErrors>({});
  const [qrFile, setQrFile] = useState<File>();
  const [qrError, setQrError] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<'save' | 'qr' | 'reload'>();
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [conflict, setConflict] = useState(false);
  const [confirmReload, setConfirmReload] = useState(false);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [mutationLock] = useState(createSystemAdminMutationLock);
  const errorRef = useRef<HTMLDivElement>(null);

  const load = useCallback(
    async (replaceDraft: boolean) => {
      const current = await getSettings(client);
      setSettings(current);
      if (replaceDraft) {
        setDraft(settingsToDraft(current));
        setDraftBaseline(current);
      }
      return current;
    },
    [client],
  );

  useEffect(() => {
    let active = true;
    setLoading(true);
    void load(true)
      .catch((caught: unknown) => {
        if (active) setError(messageFrom(caught, 'Không thể tải cấu hình cửa hàng.'));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [load]);

  useEffect(() => {
    if (error !== undefined) errorRef.current?.focus();
  }, [error]);

  const dirty = useMemo(
    () =>
      draftBaseline !== undefined &&
      draft !== undefined &&
      hasSettingsChanges(draftBaseline, draft),
    [draft, draftBaseline],
  );

  async function reload() {
    if (busy !== undefined) return;
    setBusy('reload');
    setError(undefined);
    setNotice(undefined);
    try {
      await load(true);
      setConflict(false);
      setFieldErrors({});
      setNotice('Đã tải cấu hình mới nhất.');
    } catch (caught) {
      setError(messageFrom(caught, 'Không thể tải cấu hình mới nhất.'));
    } finally {
      setBusy(undefined);
      setConfirmReload(false);
    }
  }

  async function save(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    await runSystemAdminMutation(mutationLock, async () => {
      if (settings === undefined || draft === undefined || busy !== undefined) return;
      setError(undefined);
      setNotice(undefined);
      const validation = validateSettingsDraft(settings, draft);
      setFieldErrors(validation.errors);
      if (validation.input === undefined) {
        setError('Một số thông tin chưa hợp lệ. Hãy kiểm tra các trường được đánh dấu.');
        return;
      }
      if (Object.keys(validation.input).length === 1) {
        setDraft(settingsToDraft(settings));
        setDraftBaseline(settings);
        setFieldErrors({});
        setError(undefined);
        setNotice('Chưa có thay đổi nào cần lưu.');
        return;
      }

      setBusy('save');
      setError(undefined);
      setNotice(undefined);
      try {
        const updated = await updateSettings(client, validation.input);
        setSettings(updated);
        setDraft(settingsToDraft(updated));
        setDraftBaseline(updated);
        setFieldErrors({});
        setConflict(false);
        setNotice('Đã lưu cấu hình cửa hàng.');
      } catch (caught) {
        if (caught instanceof SystemAdminError && caught.code === 'SETTINGS_VERSION_CONFLICT') {
          try {
            await load(false);
            setConflict(true);
            setError(undefined);
          } catch {
            setError(
              'Cấu hình đã được thay đổi ở nơi khác nhưng chưa thể tải bản mới nhất. Nội dung bạn nhập vẫn được giữ lại.',
            );
          }
        } else {
          setError(messageFrom(caught, 'Không thể lưu cấu hình cửa hàng.'));
        }
      } finally {
        setBusy(undefined);
      }
    });
  }

  async function upload(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    await runSystemAdminMutation(mutationLock, async () => {
      if (settings === undefined || qrFile === undefined || busy !== undefined) return;
      const fileIssue = validateQrFile(qrFile);
      if (fileIssue !== undefined) {
        setQrError(fileIssue);
        return;
      }
      setBusy('qr');
      setQrError(undefined);
      setError(undefined);
      setNotice(undefined);
      try {
        const updated = await uploadBankQr(client, settings.version, qrFile);
        setSettings(updated);
        setQrFile(undefined);
        setFileInputKey((value) => value + 1);
        setConflict(false);
        setNotice('Đã cập nhật ảnh QR chuyển khoản.');
      } catch (caught) {
        if (caught instanceof SystemAdminError && caught.code === 'SETTINGS_VERSION_CONFLICT') {
          try {
            await load(false);
            setConflict(true);
          } catch {
            setError(
              'Cấu hình đã được thay đổi ở nơi khác nhưng chưa thể tải bản mới nhất. Ảnh bạn chọn vẫn được giữ lại.',
            );
          }
        } else {
          setQrError(messageFrom(caught, 'Không thể cập nhật ảnh QR.'));
        }
      } finally {
        setBusy(undefined);
      }
    });
  }

  if (loading) return <SettingsLoadingState />;

  if (settings === undefined || draft === undefined) {
    return (
      <section className={styles.emptyState}>
        <h1>Chưa thể mở cấu hình cửa hàng</h1>
        <p>{error ?? 'Hãy kiểm tra lại kết nối rồi thử lại.'}</p>
        <Button
          loading={busy === 'reload'}
          loadingLabel="Đang tải lại"
          onClick={() => void reload()}
        >
          Thử lại
        </Button>
      </section>
    );
  }

  const summaryErrors = Object.entries(fieldErrors).map(([field, message]) => ({
    href: `#settings-${field}` as `#${string}`,
    message,
  }));

  function changeDraft(field: SettingsField, value: string) {
    setDraft((current) => (current === undefined ? current : { ...current, [field]: value }));
    setError(undefined);
    setNotice(undefined);
    setFieldErrors((current) =>
      Object.fromEntries(Object.entries(current).filter(([key]) => key !== field)),
    );
  }

  function keepLocalChanges() {
    if (draftBaseline === undefined || settings === undefined || draft === undefined) return;
    const rebased = settingsToDraft(settings);
    for (const field of changedSettingsFields(draftBaseline, draft)) rebased[field] = draft[field];
    setDraft(rebased);
    setDraftBaseline(settings);
    setConflict(false);
    setFieldErrors({});
  }

  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <div>
          <p className={styles.eyebrow}>Hệ thống</p>
          <h1>Cấu hình cửa hàng</h1>
          <p>Quản lý thông tin liên hệ, thanh toán và chính sách dùng cho đơn mới.</p>
        </div>
        <Button
          iconLeading={<ArrowsClockwiseIcon aria-hidden="true" size={18} />}
          loading={busy === 'reload'}
          loadingLabel="Đang tải lại"
          variant="secondary"
          onClick={() => {
            if (dirty) setConfirmReload(true);
            else void reload();
          }}
        >
          Tải dữ liệu mới nhất
        </Button>
      </header>

      {error === undefined ? null : (
        <InlineAlert ref={errorRef} tabIndex={-1} title="Chưa thể hoàn tất" tone="danger">
          {error}
        </InlineAlert>
      )}
      {notice === undefined ? null : (
        <InlineAlert title="Đã cập nhật" tone="success">
          {notice}
        </InlineAlert>
      )}
      {conflict ? (
        <InlineAlert title="Có thay đổi mới hơn" tone="warning">
          <p>
            Cấu hình đã được cập nhật ở nơi khác. Bản mới nhất đã tải xong; nội dung bạn đang nhập
            vẫn được giữ để bạn đối chiếu.
          </p>
          <div className={styles.conflictActions}>
            <Button
              size="compact"
              variant="secondary"
              onClick={() => {
                setDraft(settingsToDraft(settings));
                setDraftBaseline(settings);
                setConflict(false);
                setFieldErrors({});
              }}
            >
              Dùng dữ liệu mới nhất
            </Button>
            <Button size="compact" onClick={keepLocalChanges}>
              Giữ các trường tôi đã sửa
            </Button>
          </div>
        </InlineAlert>
      ) : null}

      <div className={styles.layout}>
        <form className={styles.form} noValidate onSubmit={(event) => void save(event)}>
          <ErrorSummary errors={summaryErrors} />
          <SettingsSection
            description="Thông tin khách hàng nhìn thấy khi cần liên hệ hoặc đến nhận máy."
            icon={<StorefrontIcon size={22} />}
            index="01"
            title="Thông tin cửa hàng"
          >
            <div className={styles.twoColumns}>
              <SettingInput
                draft={draft}
                disabled={busy !== undefined}
                errors={fieldErrors}
                field="storeName"
                label="Tên cửa hàng"
                maxLength={255}
                required
                onValueChange={changeDraft}
              />
              <SettingInput
                autoComplete="tel"
                draft={draft}
                disabled={busy !== undefined}
                errors={fieldErrors}
                field="storePhone"
                label="Số điện thoại"
                maxLength={32}
                required
                onValueChange={changeDraft}
              />
              <Textarea
                containerClassName={styles.fullWidth ?? ''}
                disabled={busy !== undefined}
                error={fieldErrors.storeAddress}
                id="settings-storeAddress"
                label="Địa chỉ cửa hàng"
                maxLength={2000}
                required
                rows={3}
                value={draft.storeAddress}
                onChange={(event) => {
                  changeDraft('storeAddress', event.target.value);
                }}
              />
            </div>
          </SettingsSection>

          <SettingsSection
            description="Các giá trị mặc định áp dụng khi khách đặt hoặc nhận máy."
            icon={<TruckIcon size={22} />}
            index="02"
            title="Giao nhận và thanh toán"
          >
            <div className={styles.twoColumns}>
              <SettingInput
                draft={draft}
                disabled={busy !== undefined}
                errors={fieldErrors}
                field="defaultShippingFee"
                inputMode="numeric"
                label="Phí giao hàng mặc định (đồng)"
                maxLength={15}
                required
                onValueChange={changeDraft}
              />
              <SettingInput
                draft={draft}
                disabled={busy !== undefined}
                errors={fieldErrors}
                field="shippingDepositAmount"
                inputMode="numeric"
                label="Tiền đặt trước khi giao hàng (đồng)"
                maxLength={15}
                required
                onValueChange={changeDraft}
              />
              <SettingInput
                draft={draft}
                disabled={busy !== undefined}
                errors={fieldErrors}
                field="pickupHoldMinutes"
                inputMode="numeric"
                label="Thời gian giữ máy tại cửa hàng (phút)"
                required
                onValueChange={changeDraft}
              />
              <SettingInput
                draft={draft}
                disabled={busy !== undefined}
                errors={fieldErrors}
                field="depositProofWindowMinutes"
                inputMode="numeric"
                label="Thời hạn gửi minh chứng (phút)"
                required
                onValueChange={changeDraft}
              />
              <SettingInput
                draft={draft}
                disabled={busy !== undefined}
                errors={fieldErrors}
                field="depositReviewWindowMinutes"
                inputMode="numeric"
                label="Thời gian duyệt thanh toán (phút)"
                required
                onValueChange={changeDraft}
              />
            </div>
          </SettingsSection>

          <SettingsSection
            description="Thời hạn và điều khoản mặc định hiển thị trên đơn mới và chính sách sau mua."
            icon={<ShieldCheckIcon size={22} />}
            index="03"
            title="Chính sách bảo hành"
          >
            <div className={styles.twoColumns}>
              <SettingInput
                draft={draft}
                disabled={busy !== undefined}
                errors={fieldErrors}
                field="defaultWarrantyDays"
                inputMode="numeric"
                label="Thời hạn bảo hành mặc định (ngày)"
                required
                onValueChange={changeDraft}
              />
              <Textarea
                containerClassName={styles.fullWidth ?? ''}
                disabled={busy !== undefined}
                error={fieldErrors.defaultWarrantyTerms}
                id="settings-defaultWarrantyTerms"
                label="Điều khoản bảo hành mặc định"
                maxLength={10_000}
                required
                rows={5}
                value={draft.defaultWarrantyTerms}
                onChange={(event) => {
                  changeDraft('defaultWarrantyTerms', event.target.value);
                }}
              />
            </div>
          </SettingsSection>

          <SettingsSection
            description="Thông tin chuyển khoản dùng khi khách thanh toán đơn hàng."
            icon={<BankIcon size={22} />}
            index="04"
            title="Tài khoản nhận tiền"
          >
            <div className={styles.twoColumns}>
              <SettingInput
                draft={draft}
                disabled={busy !== undefined}
                errors={fieldErrors}
                field="bankName"
                label="Ngân hàng"
                maxLength={255}
                required
                onValueChange={changeDraft}
              />
              <SettingInput
                draft={draft}
                disabled={busy !== undefined}
                errors={fieldErrors}
                field="bankAccountNumber"
                inputMode="numeric"
                label="Số tài khoản"
                maxLength={255}
                required
                onValueChange={changeDraft}
              />
              <SettingInput
                containerClassName={styles.fullWidth ?? ''}
                draft={draft}
                disabled={busy !== undefined}
                errors={fieldErrors}
                field="bankAccountHolder"
                label="Tên chủ tài khoản"
                maxLength={255}
                required
                onValueChange={changeDraft}
              />
            </div>
          </SettingsSection>

          <div className={styles.formFooter}>
            <SaveStatus busy={busy} conflict={conflict} dirty={dirty} />
            <Button
              disabled={!dirty || conflict || busy !== undefined}
              iconLeading={<FloppyDiskIcon aria-hidden="true" size={18} />}
              loading={busy === 'save'}
              loadingLabel="Đang lưu"
              type="submit"
            >
              Lưu thay đổi
            </Button>
          </div>
        </form>

        <aside className={styles.rail}>
          <section className={styles.summaryCard}>
            <div className={styles.summaryHeading}>
              <div className={styles.summaryIcon} aria-hidden="true">
                <CheckCircleIcon size={24} weight="fill" />
              </div>
              <div>
                <p className={styles.summaryEyebrow}>Đang áp dụng</p>
                <h2>Tóm tắt cấu hình</h2>
              </div>
            </div>
            <dl className={styles.summaryMetrics}>
              <div>
                <dt>
                  <TruckIcon aria-hidden="true" size={20} />
                  Phí giao hàng
                </dt>
                <dd>{formatSettingsMoney(settings.defaultShippingFee)}</dd>
              </div>
              <div>
                <dt>
                  <ClockIcon aria-hidden="true" size={20} />
                  Giữ máy tại cửa hàng
                </dt>
                <dd>{formatSettingsDuration(settings.pickupHoldMinutes)}</dd>
              </div>
              <div>
                <dt>
                  <ShieldCheckIcon aria-hidden="true" size={20} />
                  Bảo hành mặc định
                </dt>
                <dd>{formatSettingsDays(settings.defaultWarrantyDays)}</dd>
              </div>
            </dl>
            <div className={styles.summaryMeta}>
              <span>Cập nhật {formatDateTime(settings.updatedAt)}</span>
              <span>Bởi {settings.updatedBy?.fullName ?? 'Hệ thống'}</span>
            </div>
          </section>

          <section className={styles.qrCard}>
            <div className={styles.cardHeading}>
              <div>
                <h2>QR chuyển khoản</h2>
                <p>Ảnh JPEG, PNG hoặc WebP; tối đa 5 MiB.</p>
              </div>
              <ImageSquareIcon aria-hidden="true" size={28} />
            </div>
            {settings.bankQrUrl ? (
              <a
                aria-label="Xem ảnh QR đang dùng (mở trong thẻ mới)"
                className={styles.qrLink}
                href={settings.bankQrUrl}
                rel="noopener noreferrer"
                target="_blank"
              >
                Xem ảnh đang dùng
                <ArrowSquareOutIcon aria-hidden="true" size={18} />
              </a>
            ) : (
              <p className={styles.qrEmpty}>Chưa có ảnh QR chuyển khoản.</p>
            )}
            <form className={styles.uploadForm} onSubmit={(event) => void upload(event)}>
              <label
                aria-disabled={busy !== undefined}
                className={
                  busy === undefined
                    ? (styles.filePicker ?? '')
                    : `${styles.filePicker ?? ''} ${styles.filePickerDisabled ?? ''}`
                }
                htmlFor="settings-bank-qr"
              >
                <UploadSimpleIcon aria-hidden="true" size={24} />
                <span>
                  <strong>{qrFile?.name ?? 'Chọn ảnh QR mới'}</strong>
                  <small>
                    {qrFile === undefined
                      ? 'Nhấn để chọn tệp từ thiết bị'
                      : formatFileSize(qrFile.size)}
                  </small>
                </span>
              </label>
              <input
                accept="image/jpeg,image/png,image/webp"
                className={styles.fileInput}
                disabled={busy !== undefined}
                id="settings-bank-qr"
                key={fileInputKey}
                type="file"
                aria-describedby={qrError === undefined ? undefined : 'settings-bank-qr-error'}
                aria-invalid={qrError !== undefined}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  setQrFile(file);
                  setQrError(file === undefined ? undefined : validateQrFile(file));
                  setNotice(undefined);
                }}
              />
              {qrError === undefined ? null : (
                <p className={styles.fileError} id="settings-bank-qr-error" role="alert">
                  {qrError}
                </p>
              )}
              <Button
                disabled={qrFile === undefined || qrError !== undefined || busy !== undefined}
                loading={busy === 'qr'}
                loadingLabel="Đang cập nhật ảnh QR"
                type="submit"
              >
                Cập nhật ảnh QR
              </Button>
            </form>
          </section>
        </aside>
      </div>

      <BackofficeActionDialog
        confirmLabel="Tải dữ liệu mới nhất"
        description="Nội dung chưa lưu trong biểu mẫu sẽ được thay bằng cấu hình mới nhất."
        onCancel={() => {
          setConfirmReload(false);
        }}
        onConfirm={() => void reload()}
        open={confirmReload}
        pending={busy === 'reload'}
        title="Bỏ các thay đổi chưa lưu?"
      />
    </div>
  );
}

function SettingsSection({
  children,
  description,
  icon,
  index,
  title,
}: Readonly<{
  children: React.ReactNode;
  description: string;
  icon: React.ReactNode;
  index: string;
  title: string;
}>) {
  return (
    <section className={styles.section}>
      <header className={styles.sectionHeader}>
        <span className={styles.sectionIcon} aria-hidden="true">
          {icon}
        </span>
        <span className={styles.sectionHeading}>
          <span className={styles.sectionIndex}>Nhóm {index}</span>
          <h2>{title}</h2>
          <p>{description}</p>
        </span>
      </header>
      {children}
    </section>
  );
}

function SaveStatus({
  busy,
  conflict,
  dirty,
}: Readonly<{
  busy: 'save' | 'qr' | 'reload' | undefined;
  conflict: boolean;
  dirty: boolean;
}>) {
  if (busy === 'save') {
    return (
      <div className={styles.saveStatus} data-state="saving" role="status">
        <FloppyDiskIcon aria-hidden="true" size={20} />
        <span>
          <strong>Đang lưu thay đổi</strong>
          <small>Vui lòng giữ nguyên trang trong giây lát.</small>
        </span>
      </div>
    );
  }
  if (conflict) {
    return (
      <div className={styles.saveStatus} data-state="conflict" role="status">
        <WarningCircleIcon aria-hidden="true" size={20} weight="fill" />
        <span>
          <strong>Cần xử lý dữ liệu mới hơn</strong>
          <small>Chọn một phương án trong thông báo phía trên.</small>
        </span>
      </div>
    );
  }
  if (dirty) {
    return (
      <div className={styles.saveStatus} data-state="dirty" role="status">
        <PencilSimpleIcon aria-hidden="true" size={20} />
        <span>
          <strong>Có thay đổi chưa lưu</strong>
          <small>Lưu để áp dụng các giá trị mới cho đơn tiếp theo.</small>
        </span>
      </div>
    );
  }
  return (
    <div className={styles.saveStatus} data-state="saved" role="status">
      <CheckCircleIcon aria-hidden="true" size={20} weight="fill" />
      <span>
        <strong>Cấu hình đã được lưu</strong>
        <small>Các giá trị đang đồng bộ với dữ liệu áp dụng.</small>
      </span>
    </div>
  );
}

interface SettingInputProps extends Omit<
  React.ComponentProps<typeof Input>,
  'id' | 'label' | 'value' | 'onChange'
> {
  draft: SettingsDraft;
  errors: SettingsErrors;
  field: SettingsField;
  label: string;
  onValueChange: (field: SettingsField, value: string) => void;
}

function SettingInput({ draft, errors, field, label, onValueChange, ...props }: SettingInputProps) {
  return (
    <Input
      {...props}
      disabled={props.disabled ?? false}
      error={errors[field]}
      id={`settings-${field}`}
      label={label}
      value={draft[field]}
      onChange={(event) => {
        onValueChange(field, event.target.value);
      }}
    />
  );
}

function SettingsLoadingState() {
  return (
    <div className={styles.page} aria-label="Đang tải cấu hình cửa hàng" role="status">
      <div className={styles.loadingHeading} aria-hidden="true">
        <Skeleton height="1rem" width="6rem" />
        <Skeleton height="2.25rem" width="20rem" />
        <Skeleton height="1.25rem" width="32rem" />
      </div>
      <div className={styles.layout} aria-hidden="true">
        <div className={styles.loadingPanel}>
          <Skeleton height="8rem" width="100%" />
          <Skeleton height="14rem" width="100%" />
          <Skeleton height="16rem" width="100%" />
        </div>
        <div className={styles.loadingPanel}>
          <Skeleton height="7rem" width="100%" />
          <Skeleton height="16rem" width="100%" />
        </div>
      </div>
      <span className="rp-visually-hidden">Đang tải cấu hình cửa hàng…</span>
    </div>
  );
}

function formatDateTime(value: string): string {
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return 'không xác định';
  return new Intl.DateTimeFormat('vi-VN', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'Asia/Ho_Chi_Minh',
  }).format(timestamp);
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${String(bytes)} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
}

function messageFrom(caught: unknown, fallback: string): string {
  return caught instanceof Error ? caught.message : fallback;
}
