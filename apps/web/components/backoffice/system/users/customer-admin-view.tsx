'use client';

import {
  ArrowLeftIcon,
  CalendarBlankIcon,
  ClockIcon,
  EnvelopeSimpleIcon,
  LockOpenIcon,
  LockSimpleIcon,
  PhoneIcon,
  ShoppingBagIcon,
} from '@phosphor-icons/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState, type SyntheticEvent } from 'react';
import { useAuth } from '@/app/auth-provider';
import {
  BackofficeActionDialog,
  BackofficePagination,
  SystemAdminShell,
} from '@/components/backoffice';
import { Button, InlineAlert } from '@/components/ui';
import {
  activateCustomer,
  getCustomer,
  listCustomers,
  suspendCustomer,
  SystemAdminError,
  type Customer,
  type Pagination,
} from '@/lib/system-admin-api';
import {
  customerStatusPresentation,
  formatUserDateTime,
  recordAfterRefresh,
} from './user-admin-presenter';
import {
  buildCustomerListHref,
  customerDraftFromQuery,
  customerQueryFromDraft,
  customerQueryFromSearch,
  USER_ADMIN_PAGE_SIZE,
  type CustomerFilterDraft,
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
  UserSortSelect,
  UserStatusSelect,
} from './user-admin-primitives';
import styles from './users.module.css';

interface CustomerNotice {
  readonly message: string;
  readonly tone: 'success' | 'warning';
}

const EMPTY_PAGINATION: Pagination = {
  page: 1,
  pageSize: USER_ADMIN_PAGE_SIZE,
  totalItems: 0,
  totalPages: 0,
};

export function CustomerAdminView() {
  const { client, status: authStatus, user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const query = useMemo(
    () => customerQueryFromSearch(new URLSearchParams(searchParams.toString())),
    [searchParams],
  );
  const [filters, setFilters] = useState<CustomerFilterDraft>(() => customerDraftFromQuery(query));
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [pagination, setPagination] = useState<Pagination>(EMPTY_PAGINATION);
  const [selected, setSelected] = useState<Customer>();
  const [loading, setLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [listError, setListError] = useState<string>();
  const [panelError, setPanelError] = useState<string>();
  const [notice, setNotice] = useState<CustomerNotice>();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [dialogError, setDialogError] = useState<string>();
  const listRequest = useRef(0);
  const detailRequest = useRef(0);
  const selectedId = useRef<string | undefined>(undefined);
  const detailHeadingRef = useRef<HTMLHeadingElement>(null);
  const isStaff = user?.role === 'EMPLOYEE' || user?.role === 'ADMIN';
  const isAdmin = user?.role === 'ADMIN';

  const commitCustomerSelection = useCallback((customer: Customer | undefined) => {
    selectedId.current = customer?.id;
    setSelected(customer);
  }, []);

  useEffect(() => {
    setFilters(customerDraftFromQuery(query));
  }, [query]);

  useEffect(() => {
    const expected = query.q ?? '';
    if (filters.q.trim() === expected) return;
    const timer = window.setTimeout(() => {
      router.replace(buildCustomerListHref(customerQueryFromDraft(filters, query)), {
        scroll: false,
      });
    }, 350);
    return () => {
      window.clearTimeout(timer);
    };
  }, [filters, query, router]);

  const refreshList = useCallback(async () => {
    const request = ++listRequest.current;
    setLoading(true);
    setListError(undefined);
    try {
      const result = await listCustomers(client, query);
      if (request !== listRequest.current) return;
      setCustomers(result.data);
      setPagination(result.pagination);
      commitCustomerSelection(recordAfterRefresh(result.data, selectedId.current));
      setHasLoaded(true);
    } catch (caught) {
      if (request !== listRequest.current) return;
      setListError(messageFrom(caught, 'Không thể tải danh sách khách hàng.'));
      setHasLoaded(true);
    } finally {
      if (request === listRequest.current) setLoading(false);
    }
  }, [client, commitCustomerSelection, query]);

  useEffect(() => {
    if (authStatus !== 'authenticated' || !isStaff) return;
    void refreshList();
    return () => {
      listRequest.current += 1;
    };
  }, [authStatus, isStaff, refreshList]);

  async function openCustomer(id: string) {
    if (busy) return;
    const request = ++detailRequest.current;
    setDetailLoading(true);
    setPanelError(undefined);
    setNotice(undefined);
    try {
      const customer = await getCustomer(client, id);
      if (request !== detailRequest.current) return;
      commitCustomerSelection(customer);
      window.requestAnimationFrame(() => detailHeadingRef.current?.focus());
    } catch (caught) {
      if (request === detailRequest.current) {
        setPanelError(messageFrom(caught, 'Không thể mở hồ sơ khách hàng.'));
      }
    } finally {
      if (request === detailRequest.current) setDetailLoading(false);
    }
  }

  async function transition(reasonValue?: string) {
    if (!isAdmin || selected === undefined || reasonValue === undefined || busy) return;
    setBusy(true);
    setDialogError(undefined);
    setNotice(undefined);
    try {
      const updated =
        selected.status === 'ACTIVE'
          ? await suspendCustomer(client, selected.id, reasonValue)
          : await activateCustomer(client, selected.id, reasonValue);
      commitCustomerSelection(updated);
      setCustomers((current) =>
        current.map((customer) => (customer.id === updated.id ? updated : customer)),
      );
      setDialogOpen(false);
      setReason('');
      setNotice(
        updated.status === 'SUSPENDED'
          ? {
              message: 'Đã tạm khóa khách hàng và thu hồi toàn bộ phiên đăng nhập.',
              tone: 'success',
            }
          : { message: 'Đã kích hoạt lại khách hàng.', tone: 'success' },
      );
      await refreshList();
    } catch (caught) {
      if (isStateConflict(caught)) {
        setDialogOpen(false);
        await reloadCustomerAfterConflict(selected.id);
      } else {
        setDialogError(messageFrom(caught, 'Không thể đổi trạng thái khách hàng.'));
      }
    } finally {
      setBusy(false);
    }
  }

  async function reloadCustomerAfterConflict(id: string) {
    try {
      const current = await getCustomer(client, id);
      commitCustomerSelection(current);
      setCustomers((items) => items.map((item) => (item.id === current.id ? current : item)));
      setPanelError(undefined);
      setNotice({
        message: 'Tài khoản đã thay đổi ở nơi khác. Dữ liệu mới nhất đã được tải lại.',
        tone: 'warning',
      });
      await refreshList();
    } catch (caught) {
      setPanelError(
        messageFrom(caught, 'Tài khoản đã thay đổi nhưng chưa thể tải dữ liệu mới nhất.'),
      );
    }
  }

  function applyFilters(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    router.push(buildCustomerListHref(customerQueryFromDraft(filters, query)), { scroll: false });
  }

  function returnToCustomerList() {
    document.getElementById('customer-list-title')?.focus();
  }

  return (
    <SystemAdminShell breadcrumbs={[{ label: 'Hệ thống' }, { label: 'Khách hàng' }]}>
      <div className={styles.page}>
        <UserAdminPageHeader
          description="Tra cứu tài khoản, hoạt động mua hàng và quản lý trạng thái truy cập."
          title="Quản lý khách hàng"
        />

        <UserFilterBar
          onSubmit={applyFilters}
          q={filters.q}
          searchLabel="Tìm khách hàng"
          searchPlaceholder="Tìm tên, email, số điện thoại…"
          setQ={(q) => {
            setFilters((current) => ({ ...current, q }));
          }}
        >
          <UserStatusSelect
            label="Lọc theo trạng thái"
            value={filters.status}
            onChange={(value) => {
              const status: CustomerFilterDraft['status'] =
                value === 'ACTIVE' || value === 'SUSPENDED' ? value : '';
              const next: CustomerFilterDraft = { ...filters, status };
              setFilters(next);
              router.push(buildCustomerListHref(customerQueryFromDraft(next, query)), {
                scroll: false,
              });
            }}
          >
            <option value="">Tất cả trạng thái</option>
            <option value="ACTIVE">Đang hoạt động</option>
            <option value="SUSPENDED">Đang tạm khóa</option>
          </UserStatusSelect>
          <UserSortSelect
            label="Sắp xếp khách hàng"
            value={filters.sortBy}
            onChange={(sortBy) => {
              const next = { ...filters, sortBy };
              setFilters(next);
              router.push(buildCustomerListHref(customerQueryFromDraft(next, query)), {
                scroll: false,
              });
            }}
          />
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
            title={`Khách hàng (${String(pagination.totalItems)})`}
            titleId="customer-list-title"
            footer={
              <BackofficePagination
                buildHref={(page) => buildCustomerListHref(query, page)}
                page={pagination.page}
                pageSize={pagination.pageSize}
                totalItems={pagination.totalItems}
                totalPages={pagination.totalPages}
              />
            }
          >
            {!hasLoaded && loading ? <UserListSkeleton /> : null}
            {hasLoaded && customers.length === 0 && listError === undefined ? (
              <UserAdminEmptyState
                description="Thử thay đổi từ khóa, trạng thái hoặc cách sắp xếp."
                title="Không có khách hàng phù hợp"
              />
            ) : null}
            {customers.map((customer) => (
              <UserRecordButton
                detailId="customer-detail"
                disabled={busy}
                email={customer.email}
                fullName={customer.fullName}
                identity={customer.id}
                key={customer.id}
                metadata={`${String(customer.orderCount)} đơn hàng`}
                selected={selected?.id === customer.id}
                status={customerStatusPresentation(customer.status)}
                onSelect={() => void openCustomer(customer.id)}
              />
            ))}
          </UserListPanel>

          <section className={styles.detailPanel} id="customer-detail">
            <div className={styles.detailHeading}>
              <h2 ref={detailHeadingRef} tabIndex={-1}>
                Chi tiết khách hàng
              </h2>
              <Button
                className={styles.detailBack}
                iconLeading={<ArrowLeftIcon aria-hidden="true" size={18} />}
                size="compact"
                variant="ghost"
                onClick={returnToCustomerList}
              >
                Quay lại danh sách
              </Button>
            </div>
            {detailLoading ? <UserDetailSkeleton /> : null}
            {!detailLoading && selected !== undefined ? (
              <CustomerDetailPanel
                busy={busy}
                customer={selected}
                isAdmin={isAdmin}
                onTransition={() => {
                  setReason('');
                  setDialogError(undefined);
                  setDialogOpen(true);
                }}
              />
            ) : null}
            {!detailLoading && selected === undefined ? (
              <UserAdminEmptyState
                description="Chọn một khách hàng trong danh sách để xem hồ sơ."
                title="Chưa chọn khách hàng"
              />
            ) : null}
          </section>
        </div>
      </div>

      <BackofficeActionDialog
        confirmLabel={selected?.status === 'ACTIVE' ? 'Tạm khóa' : 'Kích hoạt lại'}
        description={
          selected?.status === 'ACTIVE'
            ? 'Khách hàng sẽ bị đăng xuất khỏi mọi thiết bị và không thể đăng nhập cho đến khi được kích hoạt lại.'
            : 'Khách hàng sẽ có thể đăng nhập lại bằng thông tin tài khoản hiện tại.'
        }
        destructive={selected?.status === 'ACTIVE'}
        error={dialogError}
        open={dialogOpen}
        pending={busy}
        reason={{
          hint: 'Lý do được lưu vào nhật ký hoạt động, từ 5 đến 500 ký tự.',
          label: 'Lý do thay đổi trạng thái',
          onChange: setReason,
          value: reason,
        }}
        title={selected?.status === 'ACTIVE' ? 'Tạm khóa khách hàng?' : 'Kích hoạt lại khách hàng?'}
        onCancel={() => {
          if (!busy) setDialogOpen(false);
        }}
        onConfirm={(reasonValue) => void transition(reasonValue)}
      />
    </SystemAdminShell>
  );
}

export function CustomerDetailPanel({
  busy,
  customer,
  isAdmin,
  onTransition,
}: Readonly<{
  busy: boolean;
  customer: Customer;
  isAdmin: boolean;
  onTransition: () => void;
}>) {
  const lastOrderAt = customer.lastOrderAt
    ? formatUserDateTime(customer.lastOrderAt)
    : 'Chưa có đơn hàng';
  const lastLoginAt = customer.lastLoginAt
    ? formatUserDateTime(customer.lastLoginAt)
    : 'Chưa đăng nhập';
  return (
    <div className={styles.detailBody}>
      <div className={styles.detailOverview}>
        <UserDetailIdentity
          email={customer.email}
          fullName={customer.fullName}
          identity={customer.id}
          status={customerStatusPresentation(customer.status)}
        />
        <UserDetailSummary
          items={[
            {
              icon: <ShoppingBagIcon aria-hidden="true" size={19} />,
              label: 'Số đơn hàng',
              value: `${String(customer.orderCount)} đơn hàng`,
            },
            {
              icon: <CalendarBlankIcon aria-hidden="true" size={19} />,
              label: 'Đơn gần nhất',
              value: lastOrderAt,
            },
            {
              icon: <ClockIcon aria-hidden="true" size={19} />,
              label: 'Đăng nhập gần nhất',
              value: lastLoginAt,
            },
          ]}
        />
      </div>
      <div className={styles.detailSections}>
        <UserDetailSection title="Liên hệ">
          <UserDetailField
            icon={<EnvelopeSimpleIcon aria-hidden="true" size={18} />}
            label="Email"
            value={customer.email}
          />
          <UserDetailField
            icon={<PhoneIcon aria-hidden="true" size={18} />}
            label="Số điện thoại"
            value={customer.phone ?? 'Chưa cung cấp'}
          />
        </UserDetailSection>
        <UserDetailSection title="Hoạt động tài khoản">
          <UserDetailField
            icon={<ShoppingBagIcon aria-hidden="true" size={18} />}
            label="Số đơn hàng"
            value={String(customer.orderCount)}
          />
          <UserDetailField
            icon={<CalendarBlankIcon aria-hidden="true" size={18} />}
            label="Đơn gần nhất"
            value={lastOrderAt}
          />
          <UserDetailField
            icon={<ClockIcon aria-hidden="true" size={18} />}
            label="Đăng nhập gần nhất"
            value={lastLoginAt}
          />
          <UserDetailField
            icon={<EnvelopeSimpleIcon aria-hidden="true" size={18} />}
            label="Xác minh email"
            value={
              customer.emailVerifiedAt
                ? `Đã xác minh ${formatUserDateTime(customer.emailVerifiedAt)}`
                : 'Chưa xác minh'
            }
          />
          <UserDetailField
            icon={<CalendarBlankIcon aria-hidden="true" size={18} />}
            label="Ngày tạo tài khoản"
            value={formatUserDateTime(customer.createdAt)}
          />
          {customer.suspendedAt ? (
            <UserDetailField
              icon={<LockSimpleIcon aria-hidden="true" size={18} />}
              label="Tạm khóa lúc"
              value={formatUserDateTime(customer.suspendedAt)}
            />
          ) : null}
        </UserDetailSection>
      </div>
      <div className={styles.detailActions}>
        {isAdmin ? (
          <Button
            className={customer.status === 'ACTIVE' ? styles.dangerOutline : undefined}
            disabled={busy}
            iconLeading={
              customer.status === 'ACTIVE' ? (
                <LockSimpleIcon aria-hidden="true" size={18} />
              ) : (
                <LockOpenIcon aria-hidden="true" size={18} />
              )
            }
            variant={customer.status === 'ACTIVE' ? 'secondary' : 'primary'}
            onClick={onTransition}
          >
            {customer.status === 'ACTIVE' ? 'Tạm khóa khách hàng' : 'Kích hoạt lại'}
          </Button>
        ) : (
          <p className={styles.staffNote}>
            Bạn có quyền xem hồ sơ. Chỉ quản trị viên được thay đổi trạng thái khách hàng.
          </p>
        )}
      </div>
    </div>
  );
}

function isStateConflict(caught: unknown): boolean {
  return caught instanceof SystemAdminError && caught.code === 'INVALID_STATE_TRANSITION';
}

function messageFrom(caught: unknown, fallback: string): string {
  return caught instanceof Error && caught.message.trim() !== '' ? caught.message : fallback;
}
