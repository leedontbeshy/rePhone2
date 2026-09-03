'use client';

import { useEffect, useRef, useState, type SyntheticEvent } from 'react';
import { useAuth } from '@/app/auth-provider';
import {
  Button,
  Checkbox,
  ErrorSummary,
  InlineAlert,
  Input,
  Textarea,
  type ErrorSummaryItem,
} from '@/components/ui';
import {
  AccountRequestError,
  archiveAccountAddress,
  createAccountAddress,
  listAccountAddresses,
  updateAccountAddress,
  type AccountAddress,
  type AddressCreate,
  type AddressUpdate,
} from '@/lib/account-api';
import styles from './account.module.css';
import {
  AccountAnonymousState,
  AccountLoadError,
  AccountLoadingState,
  AccountPageHeader,
  AccountPermissionState,
  MutationError,
} from './account-states';

type AddressTextField = Exclude<keyof AddressCreate, 'isDefault'>;
type AddressDraft = Record<AddressTextField, string> & Pick<AddressCreate, 'isDefault'>;
type AddressErrors = Partial<Record<AddressTextField, string>>;
type EditorDraft = { mode: 'create' } | { mode: 'edit'; address: AccountAddress };
type EditorState = EditorDraft & { ownerId: string };

const EMPTY_ADDRESS: AddressDraft = {
  label: '',
  receiverName: '',
  phone: '',
  addressLine: '',
  ward: '',
  district: '',
  province: '',
  postalCode: '',
  isDefault: false,
};

export interface OwnedAddressState {
  ownerId: string | null;
  addresses: AccountAddress[];
}

export function addressesForOwner(
  state: OwnedAddressState,
  ownerId: string | null,
): AccountAddress[] {
  return state.ownerId === ownerId ? state.addresses : [];
}

export function acceptAddressesForOwner(
  state: OwnedAddressState,
  requestOwnerId: string,
  currentOwnerId: string | null,
  addresses: AccountAddress[],
): OwnedAddressState {
  return requestOwnerId === currentOwnerId ? { ownerId: requestOwnerId, addresses } : state;
}

export function AddressBook() {
  const { client, status, user } = useAuth();
  const ownerId = status === 'authenticated' && user?.role === 'CUSTOMER' ? user.id : null;
  const ownerIdRef = useRef(ownerId);
  ownerIdRef.current = ownerId;
  const [addressState, setAddressState] = useState<OwnedAddressState>({
    ownerId: null,
    addresses: [],
  });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<AccountRequestError | null>(null);
  const [mutationError, setMutationError] = useState<AccountRequestError | null>(null);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [editorPending, setEditorPending] = useState(false);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [archivePendingId, setArchivePendingId] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const editorReturnFocusIdRef = useRef<string | null>(null);
  const pendingEditorFocusIdRef = useRef<string | null>(null);
  const archiveOperationRef = useRef<{ id: number; ownerId: string } | null>(null);
  const nextArchiveOperationIdRef = useRef(0);
  const previousOwnerIdRef = useRef(ownerId);
  const announcementRef = useRef<HTMLDivElement>(null);
  const addresses = addressesForOwner(addressState, ownerId);
  const visibleEditor = editor?.ownerId === ownerId ? editor : null;
  const initialLoading =
    status === 'authenticated' &&
    user?.role === 'CUSTOMER' &&
    (addressState.ownerId !== ownerId || (loading && addresses.length === 0));

  useEffect(() => {
    if (previousOwnerIdRef.current === ownerId) return;
    previousOwnerIdRef.current = ownerId;
    setEditor(null);
    setEditorPending(false);
    setConfirmingId(null);
    setArchivePendingId(null);
    setMutationError(null);
    setAnnouncement('');
    editorReturnFocusIdRef.current = null;
    pendingEditorFocusIdRef.current = null;
  }, [ownerId]);

  useEffect(() => {
    if (!announcement.startsWith('Đã xóa địa chỉ')) return;
    const frame = window.requestAnimationFrame(() => {
      announcementRef.current?.focus();
    });
    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [announcement]);

  useEffect(() => {
    if (visibleEditor !== null || editorPending) return;
    const returnFocusId = pendingEditorFocusIdRef.current;
    if (returnFocusId === null) return;
    pendingEditorFocusIdRef.current = null;
    window.requestAnimationFrame(() => {
      const restored = focusFirstAvailable(document, [returnFocusId, 'address-create-trigger']);
      if (!restored) announcementRef.current?.focus();
    });
  }, [editorPending, visibleEditor]);

  useEffect(() => {
    if (status === 'loading') return;
    if (status !== 'authenticated' || user?.role !== 'CUSTOMER') {
      setAddressState({ ownerId: null, addresses: [] });
      setEditor(null);
      setConfirmingId(null);
      setLoading(false);
      setLoadError(null);
      return;
    }

    if (ownerId === null) return;
    const requestOwnerId = ownerId;
    let active = true;
    setLoading(true);
    setLoadError(null);
    void listAccountAddresses(client)
      .then((value) => {
        if (active && ownerIdRef.current === requestOwnerId) {
          setAddressState((current) =>
            acceptAddressesForOwner(current, requestOwnerId, ownerIdRef.current, value),
          );
        }
      })
      .catch((caught: unknown) => {
        if (active && ownerIdRef.current === requestOwnerId) {
          setAddressState((current) =>
            current.ownerId === requestOwnerId
              ? current
              : { ownerId: requestOwnerId, addresses: [] },
          );
          setLoadError(asAccountError(caught, 'Không thể tải sổ địa chỉ.'));
        }
      })
      .finally(() => {
        if (active && ownerIdRef.current === requestOwnerId) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [client, ownerId, reloadKey, status, user?.role]);

  async function saveAddress(input: AddressCreate | AddressUpdate) {
    const mutationOwnerId = ownerId;
    if (mutationOwnerId === null || visibleEditor === null) return;
    setMutationError(null);
    setAnnouncement('');
    try {
      if (visibleEditor.mode === 'edit') {
        await updateAccountAddress(client, visibleEditor.address.id, input);
      } else {
        await createAccountAddress(client, input as AddressCreate);
      }
      const successMessage =
        visibleEditor.mode === 'edit' ? 'Đã cập nhật địa chỉ.' : 'Đã thêm địa chỉ mới.';
      if (ownerIdRef.current !== mutationOwnerId) return;
      closeEditorAfterSave();
      try {
        const latest = await listAccountAddresses(client);
        if (ownerIdRef.current !== mutationOwnerId) return;
        setAddressState((current) =>
          acceptAddressesForOwner(current, mutationOwnerId, ownerIdRef.current, latest),
        );
        setAnnouncement(successMessage);
      } catch (caught) {
        if (ownerIdRef.current !== mutationOwnerId) return;
        setLoadError(
          asAccountError(caught, 'Đã lưu địa chỉ nhưng chưa tải được dữ liệu mới nhất.'),
        );
      }
    } catch (caught) {
      if (ownerIdRef.current === mutationOwnerId) {
        throw asAccountError(caught, 'Không thể lưu địa chỉ.');
      }
    }
  }

  async function confirmArchive(address: AccountAddress) {
    const mutationOwnerId = ownerId;
    if (mutationOwnerId === null) return;
    if (archiveOperationRef.current?.ownerId === mutationOwnerId) return;
    const operation = {
      id: nextArchiveOperationIdRef.current + 1,
      ownerId: mutationOwnerId,
    };
    nextArchiveOperationIdRef.current = operation.id;
    archiveOperationRef.current = operation;
    setArchivePendingId(address.id);
    setMutationError(null);
    setAnnouncement('');
    try {
      await archiveAccountAddress(client, address.id);
      if (ownerIdRef.current !== mutationOwnerId) return;
      setConfirmingId(null);
      try {
        const latest = await listAccountAddresses(client);
        if (ownerIdRef.current !== mutationOwnerId) return;
        setAddressState((current) =>
          acceptAddressesForOwner(current, mutationOwnerId, ownerIdRef.current, latest),
        );
        setAnnouncement(
          address.isDefault
            ? 'Đã xóa địa chỉ mặc định. Chưa có địa chỉ mặc định mới.'
            : 'Đã xóa địa chỉ.',
        );
      } catch (caught) {
        if (ownerIdRef.current !== mutationOwnerId) return;
        setLoadError(
          asAccountError(caught, 'Đã xóa địa chỉ nhưng chưa tải được dữ liệu mới nhất.'),
        );
        window.requestAnimationFrame(() => {
          focusFirstAvailable(document, ['main-content']);
        });
      }
    } catch (caught) {
      if (ownerIdRef.current === mutationOwnerId) {
        setMutationError(asAccountError(caught, 'Không thể xóa địa chỉ.'));
      }
    } finally {
      if (archiveOperationRef.current === operation) {
        archiveOperationRef.current = null;
        setArchivePendingId(null);
      }
    }
  }

  function openEditor(nextEditor: EditorDraft, returnFocusId: string) {
    if (ownerId === null) return;
    editorReturnFocusIdRef.current = returnFocusId;
    setEditor({ ...nextEditor, ownerId });
    setConfirmingId(null);
    setMutationError(null);
  }

  function closeEditorAndRestoreFocus() {
    const returnFocusId = editorReturnFocusIdRef.current;
    editorReturnFocusIdRef.current = null;
    setEditor(null);
    if (returnFocusId !== null) focusElementById(returnFocusId);
  }

  function closeEditorAfterSave() {
    pendingEditorFocusIdRef.current = editorReturnFocusIdRef.current;
    editorReturnFocusIdRef.current = null;
    setEditor(null);
  }

  function handleEditorPendingChange(pending: boolean) {
    setEditorPending(pending);
  }

  function cancelArchive(addressId: string) {
    setConfirmingId(null);
    focusElementById(archiveTriggerId(addressId));
  }

  const canUseAddressBook = status === 'authenticated' && user?.role === 'CUSTOMER';
  const addressActionsDisabled = addressInteractionLocked({
    editorOpen: visibleEditor !== null,
    editorPending,
    confirmationOpen: confirmingId !== null,
    archivePending: archivePendingId !== null,
  });
  const showCreateAction =
    canUseAddressBook &&
    !loading &&
    visibleEditor === null &&
    loadError === null &&
    !addressActionsDisabled;

  return (
    <div className={styles.page}>
      <AccountPageHeader
        eyebrow="Tài khoản"
        title="Sổ địa chỉ"
        description="Lưu các địa chỉ giao hàng thường dùng. Thay đổi tại đây không làm đổi địa chỉ của những đơn hàng trước đây."
        action={
          showCreateAction ? (
            <Button
              id="address-create-trigger"
              onClick={() => {
                openEditor({ mode: 'create' }, 'address-create-trigger');
              }}
            >
              Thêm địa chỉ
            </Button>
          ) : undefined
        }
      />

      {status === 'loading' || initialLoading ? (
        <AccountLoadingState label="Đang tải sổ địa chỉ" />
      ) : status === 'anonymous' ? (
        <AccountAnonymousState returnTo="/account/addresses" />
      ) : user?.role !== 'CUSTOMER' ? (
        <AccountPermissionState />
      ) : loadError !== null ? (
        <AccountLoadError
          error={loadError}
          onRetry={() => {
            setReloadKey((value) => value + 1);
          }}
        />
      ) : (
        <>
          <div
            ref={announcementRef}
            className={styles.liveRegion}
            aria-live="polite"
            aria-atomic="true"
            tabIndex={-1}
          >
            {announcement ? <InlineAlert tone="success">{announcement}</InlineAlert> : null}
          </div>
          {mutationError !== null ? <MutationError error={mutationError} /> : null}
          {visibleEditor !== null ? (
            <AddressEditor
              key={visibleEditor.mode === 'edit' ? visibleEditor.address.id : 'new-address'}
              {...(visibleEditor.mode === 'edit' ? { address: visibleEditor.address } : {})}
              onCancel={closeEditorAndRestoreFocus}
              onPendingChange={handleEditorPendingChange}
              onSave={saveAddress}
            />
          ) : null}
          {addresses.length === 0 && visibleEditor === null ? (
            <section className={styles.emptyState}>
              <h2>Chưa có địa chỉ đã lưu</h2>
              <p>Bạn có thể thêm địa chỉ trước hoặc nhập trực tiếp khi thanh toán.</p>
              <Button
                id="address-empty-create-trigger"
                onClick={() => {
                  openEditor({ mode: 'create' }, 'address-empty-create-trigger');
                }}
              >
                Thêm địa chỉ đầu tiên
              </Button>
            </section>
          ) : null}
          {addresses.length > 0 ? (
            <ul className={styles.cardList} aria-label="Các địa chỉ đã lưu">
              {addresses.map((address) => (
                <li key={address.id}>
                  <AddressCard
                    address={address}
                    confirming={confirmingId === address.id}
                    archivePending={archivePendingId === address.id}
                    actionsDisabled={addressActionsDisabled}
                    onEdit={() => {
                      openEditor({ mode: 'edit', address }, editTriggerId(address.id));
                    }}
                    onRequestArchive={() => {
                      setConfirmingId(address.id);
                      setEditor(null);
                      setMutationError(null);
                    }}
                    onCancelArchive={() => {
                      cancelArchive(address.id);
                    }}
                    onConfirmArchive={() => void confirmArchive(address)}
                  />
                </li>
              ))}
            </ul>
          ) : null}
        </>
      )}
    </div>
  );
}

function AddressEditor({
  address,
  onCancel,
  onPendingChange,
  onSave,
}: Readonly<{
  address?: AccountAddress;
  onCancel: () => void;
  onPendingChange: (pending: boolean) => void;
  onSave: (input: AddressCreate | AddressUpdate) => Promise<void>;
}>) {
  const [draft, setDraft] = useState<AddressDraft>(() => addressDraft(address));
  const [errors, setErrors] = useState<AddressErrors>({});
  const [pending, setPending] = useState(false);
  const [requestError, setRequestError] = useState<AccountRequestError | null>(null);
  const summaryRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const pendingRef = useRef(false);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  function setText(field: AddressTextField, value: string) {
    setDraft((current) => ({ ...current, [field]: value }));
    setErrors((current) => {
      if (current[field] === undefined) return current;
      return Object.fromEntries(
        Object.entries(current).filter(([candidate]) => candidate !== field),
      );
    });
    setRequestError(null);
  }

  async function submit(event: SyntheticEvent<HTMLFormElement, SubmitEvent>) {
    event.preventDefault();
    const nextErrors = validateAddressDraft(draft);
    setErrors(nextErrors);
    setRequestError(null);
    if (Object.keys(nextErrors).length > 0) {
      focusSummary(summaryRef);
      return;
    }
    if (pendingRef.current) return;

    pendingRef.current = true;
    setPending(true);
    onPendingChange(true);
    try {
      await onSave(address === undefined ? createInput(draft) : updateInput(draft));
    } catch (caught) {
      const issue = asAccountError(caught, 'Không thể lưu địa chỉ.');
      setErrors(addressFieldErrors(issue));
      setRequestError(issue);
      focusSummary(summaryRef);
    } finally {
      pendingRef.current = false;
      setPending(false);
      onPendingChange(false);
    }
  }

  const summaryErrors: ErrorSummaryItem[] = Object.entries(errors).map(([field, message]) => ({
    href: `#address-${field}` as `#${string}`,
    message,
  }));
  if (requestError !== null && summaryErrors.length === 0) {
    summaryErrors.push({
      message: requestError.isConflict
        ? 'Dữ liệu vừa thay đổi. Đóng biểu mẫu, kiểm tra dữ liệu mới nhất rồi thử lại.'
        : requestError.message,
    });
  }

  return (
    <section className={styles.panel} aria-labelledby="address-editor-title">
      <div className={styles.sectionHeading}>
        <div>
          <h2 ref={headingRef} id="address-editor-title" tabIndex={-1}>
            {address ? 'Sửa địa chỉ' : 'Thêm địa chỉ'}
          </h2>
          <p>Thông tin này được dùng để điền nhanh khi bạn chọn giao hàng.</p>
        </div>
      </div>
      <form
        className={styles.form}
        noValidate
        aria-busy={pending || undefined}
        onSubmit={(event) => void submit(event)}
      >
        <ErrorSummary
          ref={summaryRef}
          errors={summaryErrors}
          {...(requestError?.isConflict ? { title: 'Dữ liệu vừa thay đổi' } : {})}
        />
        <div className={styles.formGrid}>
          <Input
            id="address-label"
            label="Nhãn địa chỉ"
            value={draft.label}
            maxLength={255}
            disabled={pending}
            error={errors.label}
            placeholder="Ví dụ: Nhà, Văn phòng"
            onChange={(event) => {
              setText('label', event.currentTarget.value);
            }}
          />
          <Input
            id="address-receiverName"
            label="Người nhận"
            value={draft.receiverName}
            maxLength={255}
            autoComplete="name"
            required
            disabled={pending}
            error={errors.receiverName}
            onChange={(event) => {
              setText('receiverName', event.currentTarget.value);
            }}
          />
          <Input
            id="address-phone"
            label="Số điện thoại"
            value={draft.phone}
            maxLength={32}
            inputMode="tel"
            autoComplete="tel"
            required
            disabled={pending}
            error={errors.phone}
            onChange={(event) => {
              setText('phone', event.currentTarget.value);
            }}
          />
          <Input
            id="address-postalCode"
            label="Mã bưu chính"
            value={draft.postalCode}
            maxLength={32}
            autoComplete="postal-code"
            disabled={pending}
            error={errors.postalCode}
            onChange={(event) => {
              setText('postalCode', event.currentTarget.value);
            }}
          />
          <Textarea
            id="address-addressLine"
            label="Số nhà, tên đường"
            value={draft.addressLine}
            maxLength={255}
            autoComplete="street-address"
            required
            disabled={pending}
            error={errors.addressLine}
            containerClassName={styles.fullWidth ?? ''}
            onChange={(event) => {
              setText('addressLine', event.currentTarget.value);
            }}
          />
          <Input
            id="address-ward"
            label="Phường / xã"
            value={draft.ward}
            maxLength={255}
            required
            disabled={pending}
            error={errors.ward}
            onChange={(event) => {
              setText('ward', event.currentTarget.value);
            }}
          />
          <Input
            id="address-district"
            label="Quận / huyện"
            value={draft.district}
            maxLength={255}
            required
            disabled={pending}
            error={errors.district}
            onChange={(event) => {
              setText('district', event.currentTarget.value);
            }}
          />
          <Input
            id="address-province"
            label="Tỉnh / thành phố"
            value={draft.province}
            maxLength={255}
            autoComplete="address-level1"
            required
            disabled={pending}
            error={errors.province}
            onChange={(event) => {
              setText('province', event.currentTarget.value);
            }}
          />
          <div className={styles.fullWidth}>
            <Checkbox
              id="address-isDefault"
              label="Đặt làm địa chỉ mặc định"
              checked={draft.isDefault}
              disabled={pending}
              description="Chỉ có một địa chỉ mặc định. Bỏ chọn không tự chọn địa chỉ khác."
              onChange={(event) => {
                const isDefault = event.currentTarget.checked;
                setDraft((current) => ({ ...current, isDefault }));
                setRequestError(null);
              }}
            />
          </div>
        </div>
        <div className={styles.formActions}>
          <Button type="submit" loading={pending} loadingLabel="Đang lưu địa chỉ">
            {address ? 'Lưu địa chỉ' : 'Thêm địa chỉ'}
          </Button>
          <Button type="button" variant="secondary" disabled={pending} onClick={onCancel}>
            Hủy
          </Button>
        </div>
      </form>
    </section>
  );
}

function AddressCard({
  address,
  confirming,
  archivePending,
  actionsDisabled,
  onEdit,
  onRequestArchive,
  onCancelArchive,
  onConfirmArchive,
}: Readonly<{
  address: AccountAddress;
  confirming: boolean;
  archivePending: boolean;
  actionsDisabled: boolean;
  onEdit: () => void;
  onRequestArchive: () => void;
  onCancelArchive: () => void;
  onConfirmArchive: () => void;
}>) {
  return (
    <article className={styles.card}>
      <div className={styles.cardHeader}>
        <div className={styles.cardHeaderTitle}>
          <h2>{address.label || 'Địa chỉ giao hàng'}</h2>
          {address.isDefault ? <span className={styles.defaultBadge}>Mặc định</span> : null}
        </div>
      </div>
      <div className={styles.cardBody}>
        <address className={styles.address}>
          <strong>{address.receiverName}</strong>
          <span>{address.phone}</span>
          <span>{address.addressLine}</span>
          <span>
            {address.ward}, {address.district}, {address.province}
          </span>
          {address.postalCode ? (
            <span className={styles.addressMeta}>Mã bưu chính: {address.postalCode}</span>
          ) : null}
        </address>
        <div className={styles.cardActions}>
          <Button
            id={editTriggerId(address.id)}
            variant="secondary"
            disabled={actionsDisabled}
            onClick={onEdit}
          >
            Sửa
          </Button>
          <Button
            id={archiveTriggerId(address.id)}
            variant="ghost"
            disabled={actionsDisabled}
            onClick={onRequestArchive}
          >
            Xóa
          </Button>
        </div>
      </div>
      {confirming ? (
        <AddressArchiveConfirmation
          address={address}
          pending={archivePending}
          onCancel={onCancelArchive}
          onConfirm={onConfirmArchive}
        />
      ) : null}
    </article>
  );
}

export function AddressArchiveConfirmation({
  address,
  pending,
  onCancel,
  onConfirm,
}: Readonly<{
  address: AccountAddress;
  pending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}>) {
  const confirmationRef = useRef<HTMLElement>(null);

  useEffect(() => {
    confirmationRef.current?.focus();
  }, []);

  return (
    <section
      ref={confirmationRef}
      className={styles.confirmation}
      role="alert"
      tabIndex={-1}
      aria-labelledby={`archive-${address.id}-title`}
      aria-describedby={`archive-${address.id}-description`}
    >
      <h3 id={`archive-${address.id}-title`}>Xóa địa chỉ này?</h3>
      <p id={`archive-${address.id}-description`}>
        Địa chỉ sẽ bị ẩn khỏi sổ địa chỉ và không còn dùng để điền nhanh.
      </p>
      {address.isDefault ? (
        <p className={styles.dangerCopy}>
          Đây là địa chỉ mặc định. rePhone sẽ không tự chọn địa chỉ khác sau khi xóa.
        </p>
      ) : null}
      <div className={styles.confirmationActions}>
        <Button
          variant="destructive"
          loading={pending}
          loadingLabel="Đang xóa địa chỉ"
          onClick={onConfirm}
        >
          Xác nhận xóa
        </Button>
        <Button variant="secondary" disabled={pending} onClick={onCancel}>
          Giữ lại
        </Button>
      </div>
    </section>
  );
}

export function validateAddressDraft(input: AddressDraft): AddressErrors {
  const errors: AddressErrors = {};
  validateOptionalText(input.label, 'Nhãn địa chỉ', 255, 'label', errors);
  validateRequiredText(input.receiverName, 'người nhận', 255, 'receiverName', errors);
  validateRequiredText(input.phone, 'số điện thoại', 32, 'phone', errors);
  validateRequiredText(input.addressLine, 'số nhà và tên đường', 255, 'addressLine', errors);
  validateRequiredText(input.ward, 'phường hoặc xã', 255, 'ward', errors);
  validateRequiredText(input.district, 'quận hoặc huyện', 255, 'district', errors);
  validateRequiredText(input.province, 'tỉnh hoặc thành phố', 255, 'province', errors);
  validateOptionalText(input.postalCode, 'Mã bưu chính', 32, 'postalCode', errors);
  return errors;
}

function validateRequiredText(
  value: string,
  label: string,
  maxLength: number,
  field: AddressTextField,
  errors: AddressErrors,
) {
  const trimmed = value.trim();
  if (trimmed.length === 0) errors[field] = `Nhập ${label}.`;
  else if (trimmed.length > maxLength) errors[field] = `${sentenceCase(label)} quá dài.`;
}

function validateOptionalText(
  value: string,
  label: string,
  maxLength: number,
  field: AddressTextField,
  errors: AddressErrors,
) {
  if (value.trim().length > maxLength) errors[field] = `${label} quá dài.`;
}

function sentenceCase(value: string): string {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}

function addressDraft(address?: AccountAddress): AddressDraft {
  if (address === undefined) return EMPTY_ADDRESS;
  return {
    label: address.label ?? '',
    receiverName: address.receiverName,
    phone: address.phone,
    addressLine: address.addressLine,
    ward: address.ward,
    district: address.district,
    province: address.province,
    postalCode: address.postalCode ?? '',
    isDefault: address.isDefault,
  };
}

function createInput(draft: AddressDraft): AddressCreate {
  return {
    receiverName: draft.receiverName.trim(),
    phone: draft.phone.trim(),
    addressLine: draft.addressLine.trim(),
    ward: draft.ward.trim(),
    district: draft.district.trim(),
    province: draft.province.trim(),
    isDefault: draft.isDefault,
    ...(draft.label.trim() ? { label: draft.label.trim() } : {}),
    ...(draft.postalCode.trim() ? { postalCode: draft.postalCode.trim() } : {}),
  };
}

function updateInput(draft: AddressDraft): AddressUpdate {
  return {
    receiverName: draft.receiverName.trim(),
    phone: draft.phone.trim(),
    addressLine: draft.addressLine.trim(),
    ward: draft.ward.trim(),
    district: draft.district.trim(),
    province: draft.province.trim(),
    label: draft.label.trim() || null,
    postalCode: draft.postalCode.trim() || null,
    isDefault: draft.isDefault,
  };
}

function addressFieldErrors(error: AccountRequestError): AddressErrors {
  const fields: readonly AddressTextField[] = [
    'label',
    'receiverName',
    'phone',
    'addressLine',
    'ward',
    'district',
    'province',
    'postalCode',
  ];
  return Object.fromEntries(
    error.details
      .filter(
        (detail): detail is typeof detail & { field: AddressTextField } =>
          typeof detail.field === 'string' && fields.includes(detail.field as AddressTextField),
      )
      .map((detail) => [detail.field, detail.message]),
  );
}

function asAccountError(caught: unknown, fallback: string): AccountRequestError {
  return caught instanceof AccountRequestError ? caught : new AccountRequestError(fallback);
}

function focusSummary(ref: Readonly<{ current: HTMLDivElement | null }>) {
  window.requestAnimationFrame(() => ref.current?.focus());
}

function focusElementById(id: string) {
  window.requestAnimationFrame(() => {
    focusFirstAvailable(document, [id]);
  });
}

export function focusFirstAvailable(
  documentLike: Pick<Document, 'getElementById'>,
  ids: readonly string[],
): boolean {
  for (const id of ids) {
    const element = documentLike.getElementById(id);
    if (element !== null) {
      element.focus();
      return true;
    }
  }
  return false;
}

export function addressInteractionLocked({
  editorOpen,
  editorPending,
  confirmationOpen,
  archivePending,
}: Readonly<{
  editorOpen: boolean;
  editorPending: boolean;
  confirmationOpen: boolean;
  archivePending: boolean;
}>): boolean {
  return editorOpen || editorPending || confirmationOpen || archivePending;
}

function editTriggerId(addressId: string): string {
  return `address-edit-${addressId}`;
}

function archiveTriggerId(addressId: string): string {
  return `address-archive-${addressId}`;
}
