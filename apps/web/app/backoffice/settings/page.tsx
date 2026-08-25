'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState, type SyntheticEvent } from 'react';
import {
  getSettings,
  updateSettings,
  uploadBankQr,
  type StoreSettings,
} from '../../../lib/system-admin-api';
import { useAuth } from '../../auth-provider';
import { CatalogHeader } from '../../catalog-ui';

interface SettingsDraft {
  storeName: string;
  storePhone: string;
  storeAddress: string;
  defaultShippingFee: string;
  shippingDepositAmount: string;
  pickupHoldMinutes: string;
  depositProofWindowMinutes: string;
  depositReviewWindowMinutes: string;
  defaultWarrantyDays: string;
  defaultWarrantyTerms: string;
  bankName: string;
  bankAccountNumber: string;
  bankAccountHolder: string;
}

export default function SettingsPage() {
  const { client, status, user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const [settings, setSettings] = useState<StoreSettings>();
  const [draft, setDraft] = useState<SettingsDraft>();
  const [qrFile, setQrFile] = useState<File>();
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const alertRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const current = await getSettings(client);
    setSettings(current);
    setDraft(toDraft(current));
  }, [client]);

  useEffect(() => {
    if (status !== 'authenticated' || !isAdmin) return;
    let active = true;
    setLoading(true);
    void load()
      .catch((caught: unknown) => {
        if (active) showError(caught);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [isAdmin, load, status]);

  useEffect(() => {
    if (error !== undefined) alertRef.current?.focus();
  }, [error]);

  function showError(caught: unknown) {
    setError(caught instanceof Error ? caught.message : 'Không thể hoàn tất thao tác.');
    setNotice(undefined);
  }

  async function save(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (settings === undefined || draft === undefined || busy !== undefined) return;
    const numbers = numericSettings(draft);
    if (numbers instanceof Error) {
      showError(numbers);
      return;
    }
    setBusy('save');
    setError(undefined);
    try {
      const updated = await updateSettings(client, {
        expectedVersion: settings.version,
        storeName: draft.storeName.trim(),
        storePhone: draft.storePhone.trim(),
        storeAddress: draft.storeAddress.trim(),
        defaultShippingFee: draft.defaultShippingFee,
        shippingDepositAmount: draft.shippingDepositAmount,
        defaultWarrantyTerms: draft.defaultWarrantyTerms.trim(),
        bankName: draft.bankName.trim(),
        bankAccountNumber: draft.bankAccountNumber.trim(),
        bankAccountHolder: draft.bankAccountHolder.trim(),
        ...numbers,
      });
      setSettings(updated);
      setDraft(toDraft(updated));
      setNotice(`Đã lưu cấu hình phiên bản ${String(updated.version)}.`);
    } catch (caught) {
      showError(caught);
    } finally {
      setBusy(undefined);
    }
  }

  async function upload(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (settings === undefined || qrFile === undefined || busy !== undefined) return;
    setBusy('qr');
    setError(undefined);
    try {
      const updated = await uploadBankQr(client, settings.version, qrFile);
      setSettings(updated);
      setDraft(toDraft(updated));
      setQrFile(undefined);
      setNotice(`Đã cập nhật QR ở phiên bản ${String(updated.version)}.`);
      event.currentTarget.reset();
    } catch (caught) {
      showError(caught);
    } finally {
      setBusy(undefined);
    }
  }

  return (
    <>
      <CatalogHeader />
      <main className="backoffice-shell system-admin-shell">
        <header className="backoffice-page-heading">
          <div>
            <p className="eyebrow">Quản trị hệ thống</p>
            <h1>Cấu hình cửa hàng</h1>
            <p>Optimistic concurrency bảo vệ thay đổi; snapshot đơn hàng cũ không bị viết lại.</p>
          </div>
          <button
            className="button"
            type="button"
            disabled={loading || busy !== undefined}
            onClick={() => void load()}
          >
            Tải phiên bản mới
          </button>
        </header>
        <AdminGate status={status} isAdmin={isAdmin} />
        {error === undefined ? null : (
          <div ref={alertRef} tabIndex={-1} className="commerce-alert error" role="alert">
            {error}
          </div>
        )}
        {notice === undefined ? null : (
          <div className="commerce-alert success" role="status" aria-live="polite">
            {notice}
          </div>
        )}
        {status === 'authenticated' && isAdmin && draft !== undefined && settings !== undefined ? (
          <div className="system-admin-grid settings-admin-grid">
            <form className="system-settings-form" onSubmit={(event) => void save(event)}>
              <div className="settings-version-row">
                <strong>Version {String(settings.version)}</strong>
                <span>Cập nhật: {dateTime(settings.updatedAt)}</span>
              </div>
              <SettingsFields draft={draft} disabled={busy !== undefined} setDraft={setDraft} />
              <button className="button primary" type="submit" disabled={busy !== undefined}>
                {busy === 'save' ? 'Đang lưu…' : 'Lưu bằng CAS'}
              </button>
            </form>
            <aside className="system-admin-panel">
              <h2>QR chuyển khoản</h2>
              <p>JPEG, PNG hoặc WebP; tối đa 5 MiB. QR cũ được giữ cho snapshot Payment.</p>
              {settings.bankQrUrl === null || settings.bankQrUrl === undefined ? (
                <p>Chưa cấu hình QR.</p>
              ) : (
                <Link
                  className="button"
                  href={settings.bankQrUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Mở QR hiện tại
                </Link>
              )}
              <form className="warranty-command-form" onSubmit={(event) => void upload(event)}>
                <label>
                  Tệp QR mới
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    required
                    disabled={busy !== undefined}
                    onChange={(event) => {
                      setQrFile(event.target.files?.[0]);
                    }}
                  />
                </label>
                <button
                  className="button primary"
                  type="submit"
                  disabled={busy !== undefined || qrFile === undefined}
                >
                  {busy === 'qr' ? 'Đang tải…' : 'Tải QR và tăng version'}
                </button>
              </form>
              <dl className="system-detail-list">
                <div>
                  <dt>Currency</dt>
                  <dd>{settings.currency}</dd>
                </div>
                <div>
                  <dt>Timezone</dt>
                  <dd>{settings.timezone}</dd>
                </div>
                <div>
                  <dt>Người cập nhật</dt>
                  <dd>{settings.updatedBy?.fullName ?? 'Seed/System'}</dd>
                </div>
              </dl>
            </aside>
          </div>
        ) : null}
      </main>
    </>
  );
}

function SettingsFields({
  draft,
  disabled,
  setDraft,
}: {
  draft: SettingsDraft;
  disabled: boolean;
  setDraft: (draft: SettingsDraft) => void;
}) {
  const text = (field: keyof SettingsDraft) => (value: string) => {
    setDraft({ ...draft, [field]: value });
  };
  return (
    <div className="settings-field-grid">
      <label>
        Tên cửa hàng
        <input
          value={draft.storeName}
          required
          maxLength={255}
          disabled={disabled}
          onChange={(event) => {
            text('storeName')(event.target.value);
          }}
        />
      </label>
      <label>
        Điện thoại
        <input
          value={draft.storePhone}
          required
          maxLength={32}
          disabled={disabled}
          onChange={(event) => {
            text('storePhone')(event.target.value);
          }}
        />
      </label>
      <label className="field-wide">
        Địa chỉ
        <textarea
          value={draft.storeAddress}
          required
          maxLength={2000}
          rows={3}
          disabled={disabled}
          onChange={(event) => {
            text('storeAddress')(event.target.value);
          }}
        />
      </label>
      <label>
        Phí ship mặc định
        <input
          inputMode="numeric"
          value={draft.defaultShippingFee}
          required
          disabled={disabled}
          onChange={(event) => {
            text('defaultShippingFee')(event.target.value);
          }}
        />
      </label>
      <label>
        Tiền cọc shipping
        <input
          inputMode="numeric"
          value={draft.shippingDepositAmount}
          required
          disabled={disabled}
          onChange={(event) => {
            text('shippingDepositAmount')(event.target.value);
          }}
        />
      </label>
      <label>
        Giữ pickup (phút)
        <input
          type="number"
          min={1}
          max={10080}
          value={draft.pickupHoldMinutes}
          required
          disabled={disabled}
          onChange={(event) => {
            text('pickupHoldMinutes')(event.target.value);
          }}
        />
      </label>
      <label>
        Hạn nộp proof (phút)
        <input
          type="number"
          min={1}
          max={10080}
          value={draft.depositProofWindowMinutes}
          required
          disabled={disabled}
          onChange={(event) => {
            text('depositProofWindowMinutes')(event.target.value);
          }}
        />
      </label>
      <label>
        SLA review (phút)
        <input
          type="number"
          min={1}
          max={10080}
          value={draft.depositReviewWindowMinutes}
          required
          disabled={disabled}
          onChange={(event) => {
            text('depositReviewWindowMinutes')(event.target.value);
          }}
        />
      </label>
      <label>
        Bảo hành mặc định (ngày)
        <input
          type="number"
          min={0}
          max={3650}
          value={draft.defaultWarrantyDays}
          required
          disabled={disabled}
          onChange={(event) => {
            text('defaultWarrantyDays')(event.target.value);
          }}
        />
      </label>
      <label className="field-wide">
        Điều khoản bảo hành
        <textarea
          value={draft.defaultWarrantyTerms}
          required
          maxLength={10000}
          rows={5}
          disabled={disabled}
          onChange={(event) => {
            text('defaultWarrantyTerms')(event.target.value);
          }}
        />
      </label>
      <label>
        Ngân hàng
        <input
          value={draft.bankName}
          required
          maxLength={255}
          disabled={disabled}
          onChange={(event) => {
            text('bankName')(event.target.value);
          }}
        />
      </label>
      <label>
        Số tài khoản
        <input
          value={draft.bankAccountNumber}
          required
          maxLength={255}
          disabled={disabled}
          onChange={(event) => {
            text('bankAccountNumber')(event.target.value);
          }}
        />
      </label>
      <label>
        Chủ tài khoản
        <input
          value={draft.bankAccountHolder}
          required
          maxLength={255}
          disabled={disabled}
          onChange={(event) => {
            text('bankAccountHolder')(event.target.value);
          }}
        />
      </label>
    </div>
  );
}

function toDraft(settings: StoreSettings): SettingsDraft {
  return {
    storeName: settings.storeName,
    storePhone: settings.storePhone,
    storeAddress: settings.storeAddress,
    defaultShippingFee: settings.defaultShippingFee,
    shippingDepositAmount: settings.shippingDepositAmount,
    pickupHoldMinutes: String(settings.pickupHoldMinutes),
    depositProofWindowMinutes: String(settings.depositProofWindowMinutes),
    depositReviewWindowMinutes: String(settings.depositReviewWindowMinutes),
    defaultWarrantyDays: String(settings.defaultWarrantyDays),
    defaultWarrantyTerms: settings.defaultWarrantyTerms,
    bankName: settings.bankName,
    bankAccountNumber: settings.bankAccountNumber,
    bankAccountHolder: settings.bankAccountHolder,
  };
}

function numericSettings(draft: SettingsDraft) {
  const values = {
    pickupHoldMinutes: Number(draft.pickupHoldMinutes),
    depositProofWindowMinutes: Number(draft.depositProofWindowMinutes),
    depositReviewWindowMinutes: Number(draft.depositReviewWindowMinutes),
    defaultWarrantyDays: Number(draft.defaultWarrantyDays),
  };
  if (
    !Object.values(values).every(Number.isInteger) ||
    values.pickupHoldMinutes < 1 ||
    values.pickupHoldMinutes > 10080 ||
    values.depositProofWindowMinutes < 1 ||
    values.depositProofWindowMinutes > 10080 ||
    values.depositReviewWindowMinutes < 1 ||
    values.depositReviewWindowMinutes > 10080 ||
    values.defaultWarrantyDays < 0 ||
    values.defaultWarrantyDays > 3650 ||
    !/^\d+$/.test(draft.defaultShippingFee) ||
    !/^[1-9]\d*$/.test(draft.shippingDepositAmount)
  )
    return new Error('Các giá trị tiền/thời hạn không hợp lệ.');
  return values;
}

function AdminGate({ status, isAdmin }: { status: string; isAdmin: boolean }) {
  if (status === 'loading') return <div className="status">Đang kiểm tra phiên…</div>;
  if (status === 'anonymous')
    return <div className="commerce-alert error">Cần đăng nhập ADMIN.</div>;
  return isAdmin ? null : <div className="commerce-alert error">Chỉ ADMIN được sửa cấu hình.</div>;
}

function dateTime(value: string): string {
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp)
    ? value
    : new Intl.DateTimeFormat('vi-VN', {
        dateStyle: 'short',
        timeStyle: 'short',
        timeZone: 'Asia/Ho_Chi_Minh',
      }).format(timestamp);
}
