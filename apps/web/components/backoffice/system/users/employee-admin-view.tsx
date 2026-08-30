'use client';

import {
  ArrowLeftIcon,
  ArrowCounterClockwiseIcon,
  CalendarBlankIcon,
  ClockIcon,
  EnvelopeSimpleIcon,
  IdentificationBadgeIcon,
  PencilSimpleIcon,
  PhoneIcon,
  PlusIcon,
  WarningCircleIcon,
} from '@phosphor-icons/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState, type SyntheticEvent } from 'react';
import { useAuth } from '@/app/auth-provider';
import {
  BackofficeActionDialog,
  BackofficePagination,
  SystemAdminShell,
} from '@/components/backoffice';
import { Button, ErrorSummary, InlineAlert, Input } from '@/components/ui';
import {
  createEmployee,
  disableEmployee,
  enableEmployee,
  getEmployee,
  listEmployees,
  resendInvitation,
  SystemAdminError,
  updateEmployee,
  type Employee,
  type Pagination,
} from '@/lib/system-admin-api';
import {
  EMPTY_EMPLOYEE_DRAFT,
  employeeDraftChanged,
  employeeDraftFromDetail,
  employeeEmailState,
  employeeStatusPresentation,
  employeeUpdateInput,
  focusUserDetailHeading,
  formatUserDate,
  formatUserDateTime,
  normalizeEmployeeDraft,
  recordAfterRefresh,
  validateEmployeeDraft,
  type EmployeeDraft,
  type EmployeeDraftErrors,
  type EmployeeDraftField,
} from './user-admin-presenter';
import {
  buildEmployeeListHref,
  employeeDraftFromQuery,
  employeeQueryFromDraft,
  employeeQueryFromSearch,
  USER_ADMIN_PAGE_SIZE,
  type EmployeeFilterDraft,
} from './user-admin-query';
import {
  UserAdminEmptyState,
  UserAdminPageHeader,
  UserDetailField,
  UserDetailIdentity,
  UserDetailSection,
  UserDetailSkeleton,
  UserDetailSummary,
  UserFilterBar,
  UserListPanel,
  UserListSkeleton,
  UserRecordButton,
  UserStatusSelect,
} from './user-admin-primitives';
import styles from './users.module.css';

type EmployeePanelMode = 'empty' | 'view' | 'create' | 'edit';
type EmployeeLifecycleAction = 'disable' | 'enable';

interface Notice {
  readonly message: string;
  readonly tone: 'success' | 'warning';
}

const EMPTY_PAGINATION: Pagination = {
  page: 1,
  pageSize: USER_ADMIN_PAGE_SIZE,
  totalItems: 0,
  totalPages: 0,
};

export function EmployeeAdminView() {
  const { client, status: authStatus, user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const query = useMemo(
    () => employeeQueryFromSearch(new URLSearchParams(searchParams.toString())),
    [searchParams],
  );
  const [filters, setFilters] = useState<EmployeeFilterDraft>(() => employeeDraftFromQuery(query));
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [pagination, setPagination] = useState<Pagination>(EMPTY_PAGINATION);
  const [selected, setSelected] = useState<Employee>();
  const [mode, setMode] = useState<EmployeePanelMode>('empty');
  const [draft, setDraft] = useState<EmployeeDraft>(EMPTY_EMPLOYEE_DRAFT);
  const [fieldErrors, setFieldErrors] = useState<EmployeeDraftErrors>({});
  const [loading, setLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [busy, setBusy] = useState<'create' | 'update' | 'resend' | EmployeeLifecycleAction>();
  const [listError, setListError] = useState<string>();
  const [panelError, setPanelError] = useState<string>();
  const [notice, setNotice] = useState<Notice>();
  const [lifecycleAction, setLifecycleAction] = useState<EmployeeLifecycleAction>();
  const [lifecycleReason, setLifecycleReason] = useState('');
  const [dialogError, setDialogError] = useState<string>();
  const listRequest = useRef(0);
  const detailRequest = useRef(0);
  const panelState = useRef<{
    mode: EmployeePanelMode;
    selectedId: string | undefined;
  }>({ mode: 'empty', selectedId: undefined });
  const errorSummaryRef = useRef<HTMLDivElement>(null);
  const detailHeadingRef = useRef<HTMLHeadingElement>(null);
  const isAdmin = user?.role === 'ADMIN';
  const formLocked = busy !== undefined;

  const commitEmployeePanel = useCallback(
    (employee: Employee | undefined, nextMode: EmployeePanelMode) => {
      panelState.current = { mode: nextMode, selectedId: employee?.id };
      setSelected(employee);
      setDraft(employee === undefined ? EMPTY_EMPLOYEE_DRAFT : employeeDraftFromDetail(employee));
      setMode(nextMode);
    },
    [],
  );

  useEffect(() => {
    setFilters(employeeDraftFromQuery(query));
  }, [query]);

  useEffect(() => {
    const expected = query.q ?? '';
    if (filters.q.trim() === expected) return;
    const timer = window.setTimeout(() => {
      router.replace(buildEmployeeListHref(employeeQueryFromDraft(filters, query)), {
        scroll: false,
      });
    }, 350);
    return () => {
      window.clearTimeout(timer);
    };
  }, [filters, query, router]);

  const refreshList = useCallback(
    async (fallbackToFirst = true) => {
      const request = ++listRequest.current;
      setLoading(true);
      setListError(undefined);
      try {
        const result = await listEmployees(client, query);
        if (request !== listRequest.current) return;
        setEmployees(result.data);
        setPagination(result.pagination);
        if (panelState.current.mode === 'empty' || panelState.current.mode === 'view') {
          const nextEmployee = recordAfterRefresh(
            result.data,
            panelState.current.selectedId,
            fallbackToFirst,
          );
          if (
            nextEmployee !== undefined ||
            fallbackToFirst ||
            panelState.current.mode === 'empty'
          ) {
            commitEmployeePanel(nextEmployee, nextEmployee === undefined ? 'empty' : 'view');
          }
        }
        setHasLoaded(true);
      } catch (caught) {
        if (request !== listRequest.current) return;
        setListError(messageFrom(caught, 'Không thể tải danh sách nhân viên.'));
        setHasLoaded(true);
      } finally {
        if (request === listRequest.current) setLoading(false);
      }
    },
    [client, commitEmployeePanel, query],
  );

  useEffect(() => {
    if (authStatus !== 'authenticated' || !isAdmin) return;
    void refreshList();
    return () => {
      listRequest.current += 1;
    };
  }, [authStatus, isAdmin, refreshList]);

  useEffect(() => {
    if (Object.keys(fieldErrors).length > 0) errorSummaryRef.current?.focus();
  }, [fieldErrors]);

  async function openEmployee(id: string) {
    if (formLocked || mode === 'create' || mode === 'edit') return;
    const request = ++detailRequest.current;
    setDetailLoading(true);
    setPanelError(undefined);
    setNotice(undefined);
    try {
      const employee = await getEmployee(client, id);
      if (request !== detailRequest.current) return;
      commitEmployeePanel(employee, 'view');
      setFieldErrors({});
      window.requestAnimationFrame(() => {
        focusUserDetailHeading(detailHeadingRef.current);
      });
    } catch (caught) {
      if (request === detailRequest.current) {
        setPanelError(messageFrom(caught, 'Không thể mở hồ sơ nhân viên.'));
      }
    } finally {
      if (request === detailRequest.current) setDetailLoading(false);
    }
  }

  function startCreate() {
    if (formLocked) return;
    commitEmployeePanel(undefined, 'create');
    setFieldErrors({});
    setPanelError(undefined);
    setNotice(undefined);
    window.requestAnimationFrame(() => detailHeadingRef.current?.focus());
  }

  function startEdit() {
    if (selected === undefined || formLocked) return;
    commitEmployeePanel(selected, 'edit');
    setFieldErrors({});
    setPanelError(undefined);
  }

  function cancelEditor() {
    setFieldErrors({});
    setPanelError(undefined);
    if (selected === undefined) {
      commitEmployeePanel(undefined, 'empty');
      return;
    }
    commitEmployeePanel(selected, 'view');
  }

  async function submitEmployee(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if ((mode !== 'create' && mode !== 'edit') || formLocked) return;
    const errors = validateEmployeeDraft(draft, mode);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      setPanelError('Một số thông tin chưa hợp lệ. Hãy kiểm tra các trường được đánh dấu.');
      return;
    }
    const normalized = normalizeEmployeeDraft(draft);
    if (mode === 'edit' && selected !== undefined && !employeeDraftChanged(selected, draft)) {
      setNotice({ message: 'Chưa có thay đổi nào cần lưu.', tone: 'warning' });
      commitEmployeePanel(selected, 'view');
      return;
    }

    setBusy(mode === 'create' ? 'create' : 'update');
    setPanelError(undefined);
    setNotice(undefined);
    try {
      if (mode === 'create') {
        const created = await createEmployee(client, {
          email: normalized.email,
          employeeCode: normalized.employeeCode,
          fullName: normalized.fullName,
          ...(normalized.phone === '' ? {} : { phone: normalized.phone }),
          ...(normalized.hiredAt === '' ? {} : { hiredAt: normalized.hiredAt }),
        });
        commitEmployeePanel(created.employee, 'view');
        setNotice(
          created.deliveryStatus === 'SENT'
            ? { message: 'Đã tạo nhân viên và gửi lời mời kích hoạt.', tone: 'success' }
            : {
                message:
                  'Đã tạo nhân viên, nhưng email lời mời chưa gửi được. Bạn có thể gửi lại khi dịch vụ email ổn định.',
                tone: 'warning',
              },
        );
      } else if (selected !== undefined) {
        const updated = await updateEmployee(
          client,
          selected.id,
          employeeUpdateInput(selected, draft),
        );
        commitEmployeePanel(updated, 'view');
        setNotice({ message: 'Đã cập nhật hồ sơ nhân viên.', tone: 'success' });
      }
      setFieldErrors({});
      void refreshList(false);
    } catch (caught) {
      if (selected !== undefined && isStateConflict(caught)) {
        await reloadEmployeeAfterConflict(selected.id);
      } else {
        setPanelError(messageFrom(caught, 'Không thể lưu hồ sơ nhân viên.'));
      }
    } finally {
      setBusy(undefined);
    }
  }

  async function resend() {
    if (selected === undefined || selected.status !== 'PENDING_VERIFICATION' || formLocked) return;
    setBusy('resend');
    setPanelError(undefined);
    setNotice(undefined);
    try {
      const delivery = await resendInvitation(client, selected.id);
      setNotice(
        delivery === 'SENT'
          ? { message: 'Đã gửi lại lời mời kích hoạt.', tone: 'success' }
          : {
              message:
                'Đã làm mới lời mời, nhưng email chưa gửi được. Hãy thử lại khi dịch vụ email ổn định.',
              tone: 'warning',
            },
      );
    } catch (caught) {
      if (isStateConflict(caught)) await reloadEmployeeAfterConflict(selected.id);
      else setPanelError(messageFrom(caught, 'Không thể gửi lại lời mời.'));
    } finally {
      setBusy(undefined);
    }
  }

  function askLifecycle(action: EmployeeLifecycleAction) {
    setLifecycleAction(action);
    setLifecycleReason('');
    setDialogError(undefined);
  }

  async function confirmLifecycle(reason?: string) {
    if (selected === undefined || lifecycleAction === undefined || reason === undefined) return;
    const action = lifecycleAction;
    setBusy(action);
    setDialogError(undefined);
    try {
      const updated =
        action === 'disable'
          ? await disableEmployee(client, selected.id, reason)
          : await enableEmployee(client, selected.id, reason);
      commitEmployeePanel(updated, 'view');
      setEmployees((current) =>
        current.map((employee) => (employee.id === updated.id ? updated : employee)),
      );
      setLifecycleAction(undefined);
      setLifecycleReason('');
      setNotice(
        updated.status === 'DISABLED'
          ? {
              message: 'Đã vô hiệu hóa nhân viên và thu hồi toàn bộ phiên đăng nhập.',
              tone: 'success',
            }
          : updated.status === 'PENDING_VERIFICATION'
            ? {
                message: 'Tài khoản đã chuyển sang chờ kích hoạt. Có thể gửi lại lời mời nếu cần.',
                tone: 'warning',
              }
            : { message: 'Đã kích hoạt lại nhân viên.', tone: 'success' },
      );
      void refreshList(false);
    } catch (caught) {
      if (isStateConflict(caught)) {
        setLifecycleAction(undefined);
        await reloadEmployeeAfterConflict(selected.id);
      } else {
        setDialogError(messageFrom(caught, 'Không thể đổi trạng thái nhân viên.'));
      }
    } finally {
      setBusy(undefined);
    }
  }

  async function reloadEmployeeAfterConflict(id: string) {
    try {
      const current = await getEmployee(client, id);
      commitEmployeePanel(current, 'view');
      setEmployees((items) => items.map((item) => (item.id === current.id ? current : item)));
      setPanelError(undefined);
      setNotice({
        message: 'Tài khoản đã thay đổi ở nơi khác. Dữ liệu mới nhất đã được tải lại.',
        tone: 'warning',
      });
      await refreshList(false);
    } catch (caught) {
      setPanelError(
        messageFrom(caught, 'Tài khoản đã thay đổi nhưng chưa thể tải dữ liệu mới nhất.'),
      );
    }
  }

  function applyFilters(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    router.push(buildEmployeeListHref(employeeQueryFromDraft(filters, query)), { scroll: false });
  }

  function returnToEmployeeList() {
    document.getElementById('employee-list-title')?.focus();
  }

  return (
    <SystemAdminShell breadcrumbs={[{ label: 'Hệ thống' }, { label: 'Nhân viên' }]}>
      <div className={styles.page}>
        <UserAdminPageHeader
          action={
            <Button
              disabled={formLocked || mode === 'create' || mode === 'edit'}
              iconLeading={<PlusIcon aria-hidden="true" size={18} />}
              onClick={startCreate}
            >
              Thêm nhân viên
            </Button>
          }
          description="Tạo tài khoản bằng lời mời và quản lý vòng đời truy cập của nhân viên."
          title="Quản lý nhân viên"
        />

        <UserFilterBar
          onSubmit={applyFilters}
          q={filters.q}
          searchLabel="Tìm nhân viên"
          searchPlaceholder="Tìm tên, email, mã nhân viên…"
          setQ={(q) => {
            setFilters((current) => ({ ...current, q }));
          }}
        >
          <UserStatusSelect
            label="Lọc theo trạng thái"
            value={filters.status}
            onChange={(value) => {
              const status: EmployeeFilterDraft['status'] =
                value === 'PENDING_VERIFICATION' || value === 'ACTIVE' || value === 'DISABLED'
                  ? value
                  : '';
              const next: EmployeeFilterDraft = { ...filters, status };
              setFilters(next);
              router.push(buildEmployeeListHref(employeeQueryFromDraft(next, query)), {
                scroll: false,
              });
            }}
          >
            <option value="">Tất cả trạng thái</option>
            <option value="PENDING_VERIFICATION">Chờ kích hoạt</option>
            <option value="ACTIVE">Đang hoạt động</option>
            <option value="DISABLED">Đã vô hiệu hóa</option>
          </UserStatusSelect>
        </UserFilterBar>

        <div className={styles.noticeStack} aria-live="polite">
          {listError === undefined ? null : (
            <InlineAlert title="Chưa thể tải danh sách" tone="danger">
              <div className={styles.alertContent}>
                <span>{listError}</span>
                <Button size="compact" variant="secondary" onClick={() => void refreshList()}>
                  Thử lại
                </Button>
              </div>
            </InlineAlert>
          )}
          {panelError === undefined ? null : (
            <InlineAlert title="Chưa thể hoàn tất" tone="danger">
              {panelError}
            </InlineAlert>
          )}
          {notice === undefined ? null : (
            <InlineAlert
              title={notice.tone === 'success' ? 'Đã cập nhật' : 'Cần lưu ý'}
              tone={notice.tone}
            >
              {notice.message}
            </InlineAlert>
          )}
        </div>

        <div className={styles.masterDetail}>
          <UserListPanel
            loading={loading}
            title={`Nhân viên (${String(pagination.totalItems)})`}
            titleId="employee-list-title"
            footer={
              <BackofficePagination
                buildHref={(page) => buildEmployeeListHref(query, page)}
                page={pagination.page}
                pageSize={pagination.pageSize}
                totalItems={pagination.totalItems}
                totalPages={pagination.totalPages}
              />
            }
          >
            {!hasLoaded && loading ? <UserListSkeleton /> : null}
            {hasLoaded && employees.length === 0 && listError === undefined ? (
              <UserAdminEmptyState
                description="Thử thay đổi từ khóa hoặc trạng thái đang lọc."
                title="Không có nhân viên phù hợp"
              />
            ) : null}
            {employees.map((employee) => (
              <UserRecordButton
                detailId="employee-detail"
                disabled={formLocked || mode === 'create' || mode === 'edit'}
                email={employee.email}
                fullName={employee.fullName}
                identity={employee.id}
                key={employee.id}
                metadata={employee.employeeCode}
                selected={selected?.id === employee.id}
                status={employeeStatusPresentation(employee.status)}
                onSelect={() => void openEmployee(employee.id)}
              />
            ))}
          </UserListPanel>

          <section className={styles.detailPanel} id="employee-detail">
            <div className={styles.detailHeading}>
              <h2 ref={detailHeadingRef} tabIndex={-1}>
                {mode === 'create'
                  ? 'Thêm nhân viên'
                  : mode === 'edit'
                    ? 'Chỉnh sửa nhân viên'
                    : 'Chi tiết nhân viên'}
              </h2>
              <Button
                className={styles.detailBack}
                iconLeading={<ArrowLeftIcon aria-hidden="true" size={18} />}
                size="compact"
                variant="ghost"
                onClick={returnToEmployeeList}
              >
                Quay lại danh sách
              </Button>
            </div>
            {detailLoading ? <UserDetailSkeleton /> : null}
            {!detailLoading && (mode === 'create' || mode === 'edit') ? (
              <EmployeeEditor
                busy={formLocked}
                draft={draft}
                errors={fieldErrors}
                mode={mode}
                summaryRef={errorSummaryRef}
                onCancel={cancelEditor}
                onChange={(field, value) => {
                  setDraft((current) => ({ ...current, [field]: value }));
                  setFieldErrors((current) =>
                    Object.fromEntries(Object.entries(current).filter(([key]) => key !== field)),
                  );
                }}
                onSubmit={(event) => {
                  void submitEmployee(event);
                }}
              />
            ) : null}
            {!detailLoading && mode === 'view' && selected !== undefined ? (
              <EmployeeDetailPanel
                busy={formLocked}
                employee={selected}
                onDisable={() => {
                  askLifecycle('disable');
                }}
                onEdit={startEdit}
                onEnable={() => {
                  askLifecycle('enable');
                }}
                onResend={() => void resend()}
              />
            ) : null}
            {!detailLoading && mode === 'empty' ? (
              <UserAdminEmptyState
                description="Chọn một nhân viên trong danh sách hoặc thêm hồ sơ mới."
                title="Chưa chọn nhân viên"
              />
            ) : null}
          </section>
        </div>
      </div>

      <BackofficeActionDialog
        confirmLabel={lifecycleAction === 'disable' ? 'Vô hiệu hóa' : 'Kích hoạt lại'}
        description={
          lifecycleAction === 'disable'
            ? 'Nhân viên sẽ bị đăng xuất khỏi mọi thiết bị và không thể truy cập backoffice.'
            : 'Nhân viên sẽ được phép truy cập lại theo trạng thái xác minh email hiện tại.'
        }
        destructive={lifecycleAction === 'disable'}
        error={dialogError}
        open={lifecycleAction !== undefined}
        pending={busy === lifecycleAction}
        reason={{
          hint: 'Lý do được lưu vào nhật ký hoạt động, từ 5 đến 500 ký tự.',
          label: 'Lý do thay đổi trạng thái',
          onChange: setLifecycleReason,
          value: lifecycleReason,
        }}
        title={
          lifecycleAction === 'disable' ? 'Vô hiệu hóa nhân viên?' : 'Kích hoạt lại nhân viên?'
        }
        onCancel={() => {
          if (busy === undefined) setLifecycleAction(undefined);
        }}
        onConfirm={(reason) => void confirmLifecycle(reason)}
      />
    </SystemAdminShell>
  );
}

export function EmployeeDetailPanel({
  busy,
  employee,
  onDisable,
  onEdit,
  onEnable,
  onResend,
}: Readonly<{
  busy: boolean;
  employee: Employee;
  onDisable: () => void;
  onEdit: () => void;
  onEnable: () => void;
  onResend: () => void;
}>) {
  const status = employeeStatusPresentation(employee.status);
  const hiredAt = employee.hiredAt ? formatUserDate(employee.hiredAt) : 'Chưa ghi nhận';
  const lastLoginAt = employee.lastLoginAt
    ? formatUserDateTime(employee.lastLoginAt)
    : 'Chưa đăng nhập';
  return (
    <div className={styles.detailBody}>
      <div className={styles.detailOverview}>
        <UserDetailIdentity
          aside={
            <>
              <span>Mã nhân viên</span>
              <strong>{employee.employeeCode}</strong>
            </>
          }
          email={employee.email}
          fullName={employee.fullName}
          identity={employee.id}
          status={status}
        />
        <UserDetailSummary
          items={[
            {
              icon: <CalendarBlankIcon aria-hidden="true" size={19} />,
              label: 'Ngày vào làm',
              value: hiredAt,
            },
            {
              icon: <ClockIcon aria-hidden="true" size={19} />,
              label: 'Đăng nhập gần nhất',
              value: lastLoginAt,
            },
            {
              icon: <EnvelopeSimpleIcon aria-hidden="true" size={19} />,
              label: 'Trạng thái email',
              value: employeeEmailState(employee),
            },
          ]}
        />
      </div>
      <div className={styles.detailSections}>
        <UserDetailSection title="Liên hệ">
          <UserDetailField
            icon={<EnvelopeSimpleIcon aria-hidden="true" size={18} />}
            label="Email"
            value={employee.email}
          />
          <UserDetailField
            icon={<PhoneIcon aria-hidden="true" size={18} />}
            label="Số điện thoại"
            value={employee.phone ?? 'Chưa cung cấp'}
          />
        </UserDetailSection>
        <UserDetailSection title="Tài khoản">
          <UserDetailField
            icon={<IdentificationBadgeIcon aria-hidden="true" size={18} />}
            label="Mã nhân viên"
            value={employee.employeeCode}
          />
          <UserDetailField
            icon={<CalendarBlankIcon aria-hidden="true" size={18} />}
            label="Ngày vào làm"
            value={hiredAt}
          />
          <UserDetailField
            icon={<EnvelopeSimpleIcon aria-hidden="true" size={18} />}
            label="Trạng thái email"
            value={employeeEmailState(employee)}
          />
          <UserDetailField
            icon={<ClockIcon aria-hidden="true" size={18} />}
            label="Đăng nhập gần nhất"
            value={lastLoginAt}
          />
          <UserDetailField
            icon={<CalendarBlankIcon aria-hidden="true" size={18} />}
            label="Ngày tạo hồ sơ"
            value={formatUserDateTime(employee.createdAt)}
          />
          {employee.disabledAt ? (
            <UserDetailField
              icon={<WarningCircleIcon aria-hidden="true" size={18} />}
              label="Vô hiệu hóa lúc"
              value={formatUserDateTime(employee.disabledAt)}
            />
          ) : null}
        </UserDetailSection>
      </div>
      <div className={styles.detailActions}>
        {employee.status === 'PENDING_VERIFICATION' ? (
          <Button
            disabled={busy}
            iconLeading={<EnvelopeSimpleIcon aria-hidden="true" size={18} />}
            onClick={onResend}
          >
            Gửi lại lời mời
          </Button>
        ) : null}
        {employee.status === 'DISABLED' ? (
          <Button
            disabled={busy}
            iconLeading={<ArrowCounterClockwiseIcon aria-hidden="true" size={18} />}
            onClick={onEnable}
          >
            Kích hoạt lại
          </Button>
        ) : null}
        <Button
          disabled={busy}
          iconLeading={<PencilSimpleIcon aria-hidden="true" size={18} />}
          variant={employee.status === 'ACTIVE' ? 'primary' : 'secondary'}
          onClick={onEdit}
        >
          Chỉnh sửa
        </Button>
        {employee.status === 'DISABLED' ? null : (
          <Button
            className={styles.dangerOutline}
            disabled={busy}
            iconLeading={<WarningCircleIcon aria-hidden="true" size={18} />}
            variant="secondary"
            onClick={onDisable}
          >
            Vô hiệu hóa
          </Button>
        )}
      </div>
    </div>
  );
}

function EmployeeEditor({
  busy,
  draft,
  errors,
  mode,
  summaryRef,
  onCancel,
  onChange,
  onSubmit,
}: Readonly<{
  busy: boolean;
  draft: EmployeeDraft;
  errors: EmployeeDraftErrors;
  mode: 'create' | 'edit';
  summaryRef: React.RefObject<HTMLDivElement | null>;
  onCancel: () => void;
  onChange: (field: EmployeeDraftField, value: string) => void;
  onSubmit: (event: SyntheticEvent<HTMLFormElement>) => void;
}>) {
  const summaryErrors = Object.entries(errors).map(([field, message]) => ({
    href: `#employee-${field}` as `#${string}`,
    message,
  }));
  return (
    <form className={styles.form} noValidate onSubmit={onSubmit}>
      <ErrorSummary errors={summaryErrors} ref={summaryRef} />
      <div className={styles.formGrid}>
        <Input
          autoComplete="name"
          containerClassName={styles.formWide ?? ''}
          disabled={busy}
          error={errors.fullName}
          id="employee-fullName"
          label="Họ và tên"
          maxLength={255}
          required
          value={draft.fullName}
          onChange={(event) => {
            onChange('fullName', event.target.value);
          }}
        />
        <Input
          autoComplete="email"
          disabled={busy || mode === 'edit'}
          error={errors.email}
          id="employee-email"
          label="Email"
          maxLength={320}
          required={mode === 'create'}
          type="email"
          value={draft.email}
          onChange={(event) => {
            onChange('email', event.target.value);
          }}
        />
        <Input
          autoCapitalize="characters"
          disabled={busy}
          error={errors.employeeCode}
          id="employee-employeeCode"
          label="Mã nhân viên"
          maxLength={64}
          required
          value={draft.employeeCode}
          onChange={(event) => {
            onChange('employeeCode', event.target.value.toUpperCase());
          }}
        />
        <Input
          autoComplete="tel"
          disabled={busy}
          error={errors.phone}
          id="employee-phone"
          label="Số điện thoại"
          maxLength={32}
          type="tel"
          value={draft.phone}
          onChange={(event) => {
            onChange('phone', event.target.value);
          }}
        />
        <Input
          disabled={busy}
          error={errors.hiredAt}
          id="employee-hiredAt"
          label="Ngày vào làm"
          type="date"
          value={draft.hiredAt}
          onChange={(event) => {
            onChange('hiredAt', event.target.value);
          }}
        />
      </div>
      <div className={styles.formActions}>
        <Button disabled={busy} type="button" variant="secondary" onClick={onCancel}>
          Hủy
        </Button>
        <Button
          loading={busy}
          loadingLabel={mode === 'create' ? 'Đang tạo nhân viên' : 'Đang lưu hồ sơ'}
          type="submit"
        >
          {mode === 'create' ? 'Tạo và gửi lời mời' : 'Lưu thay đổi'}
        </Button>
      </div>
    </form>
  );
}

function isStateConflict(caught: unknown): boolean {
  return caught instanceof SystemAdminError && caught.code === 'INVALID_STATE_TRANSITION';
}

function messageFrom(caught: unknown, fallback: string): string {
  return caught instanceof Error && caught.message.trim() !== '' ? caught.message : fallback;
}
