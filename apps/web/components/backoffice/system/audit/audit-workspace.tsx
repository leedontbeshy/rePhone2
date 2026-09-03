'use client';

import { ArrowLeftIcon, ArrowRightIcon, ClockCounterClockwiseIcon } from '@phosphor-icons/react';
import NextLink from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type MouseEvent,
  type RefObject,
  type SetStateAction,
  type SyntheticEvent,
} from 'react';
import { useAuth } from '@/app/auth-provider';
import { SystemAdminShell } from '@/components/backoffice';
import { Button, ErrorSummary, InlineAlert, Input, Select, Skeleton } from '@/components/ui';
import {
  getAuditLog,
  listAuditLogs,
  type AuditLogDetail,
  type AuditQuery,
  type Pagination,
} from '@/lib/system-admin-api';
import {
  AUDIT_ACTION_FILTERS,
  DEFAULT_AUDIT_QUERY,
  auditActionLabel,
  auditActorLabel,
  auditDraftFromQuery,
  focusAuditDetailHeading,
  auditListQueryKey,
  auditQueryFromDraft,
  auditResourceLabel,
  auditWorkspaceHref,
  formatAuditDateTime,
  humanizeAuditPayload,
  parseAuditQuery,
  projectAuditListItem,
  type AuditFilterDraft,
  type AuditFilterErrors,
  type AuditListRow,
  type AuditPayloadPresentation,
} from './audit-presenter';
import styles from './audit.module.css';

const EMPTY_PAGINATION: Pagination = {
  page: 1,
  pageSize: 20,
  totalItems: 0,
  totalPages: 0,
};

export function AuditLogWorkspace() {
  return (
    <SystemAdminShell breadcrumbs={[{ label: 'Hệ thống' }, { label: 'Nhật ký hoạt động' }]}>
      <AuditLogWorkspaceContent />
    </SystemAdminShell>
  );
}

function AuditLogWorkspaceContent() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedId = searchParams.get('selected')?.trim() || undefined;
  const queryKey = auditListQueryKey(searchParams);
  const query = useMemo(() => parseAuditQuery(new URLSearchParams(queryKey)), [queryKey]);
  const { client } = useAuth();
  const [draft, setDraft] = useState<AuditFilterDraft>(() => auditDraftFromQuery(query));
  const [filterErrors, setFilterErrors] = useState<AuditFilterErrors>({});
  const [rows, setRows] = useState<AuditListRow[]>([]);
  const [pagination, setPagination] = useState<Pagination>(EMPTY_PAGINATION);
  const [listLoading, setListLoading] = useState(true);
  const [hasLoadedList, setHasLoadedList] = useState(false);
  const [listError, setListError] = useState<string>();
  const [listReloadKey, setListReloadKey] = useState(0);
  const [loadedQueryKey, setLoadedQueryKey] = useState<string>();
  const [automaticSelection, setAutomaticSelection] = useState<string>();
  const [optimisticSelection, setOptimisticSelection] = useState<string>();
  const [detail, setDetail] = useState<AuditLogDetail>();
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string>();
  const [detailReloadKey, setDetailReloadKey] = useState(0);
  const listErrorRef = useRef<HTMLDivElement>(null);
  const filterErrorRef = useRef<HTMLDivElement>(null);
  const detailHeadingRef = useRef<HTMLHeadingElement>(null);
  const activeId = optimisticSelection ?? selectedId ?? automaticSelection;

  useEffect(() => {
    if (optimisticSelection !== undefined && selectedId === optimisticSelection) {
      setOptimisticSelection(undefined);
    }
  }, [optimisticSelection, selectedId]);

  useEffect(() => {
    setDraft(auditDraftFromQuery(query));
    setFilterErrors({});
  }, [query]);

  useEffect(() => {
    let active = true;
    setListLoading(true);
    setListError(undefined);
    void listAuditLogs(client, query)
      .then((result) => {
        if (!active) return;
        const nextRows = result.data.map(projectAuditListItem);
        setRows(nextRows);
        setPagination(result.pagination);
        setHasLoadedList(true);
        setLoadedQueryKey(queryKey);
        setAutomaticSelection((current) =>
          current !== undefined && nextRows.some((row) => row.id === current)
            ? current
            : nextRows[0]?.id,
        );
      })
      .catch((caught: unknown) => {
        if (!active) return;
        setListError(caught instanceof Error ? caught.message : 'Không thể tải nhật ký hoạt động.');
      })
      .finally(() => {
        if (active) setListLoading(false);
      });
    return () => {
      active = false;
    };
  }, [client, listReloadKey, query, queryKey]);

  useEffect(() => {
    if (activeId === undefined) {
      setDetail(undefined);
      setDetailError(undefined);
      setDetailLoading(false);
      return;
    }
    let active = true;
    setDetail(undefined);
    setDetailError(undefined);
    setDetailLoading(true);
    void getAuditLog(client, activeId)
      .then((result) => {
        if (active) setDetail(result);
      })
      .catch((caught: unknown) => {
        if (!active) return;
        setDetailError(
          caught instanceof Error ? caught.message : 'Không thể mở bản ghi hoạt động.',
        );
      })
      .finally(() => {
        if (active) setDetailLoading(false);
      });
    return () => {
      active = false;
    };
  }, [activeId, client, detailReloadKey]);

  useEffect(() => {
    if (listError !== undefined) listErrorRef.current?.focus();
  }, [listError]);

  useEffect(() => {
    if (
      detail !== undefined &&
      selectedId !== undefined &&
      typeof window !== 'undefined' &&
      window.matchMedia('(max-width: 59.99rem)').matches
    ) {
      focusAuditDetailHeading(detailHeadingRef.current);
    }
  }, [detail, selectedId]);

  function navigate(next: AuditQuery) {
    const href = auditWorkspaceHref(next, selectedId);
    const currentSearch = searchParams.toString();
    const currentHref = `${pathname}${currentSearch === '' ? '' : `?${currentSearch}`}`;
    if (currentHref === href) {
      setListReloadKey((current) => current + 1);
      return;
    }
    router.push(href, { scroll: false });
  }

  function applyFilters(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = auditQueryFromDraft(draft);
    setFilterErrors(result.errors);
    if (result.query === undefined) {
      requestAnimationFrame(() => {
        filterErrorRef.current?.focus();
      });
      return;
    }
    navigate(result.query);
  }

  function resetFilters() {
    setDraft(auditDraftFromQuery(DEFAULT_AUDIT_QUERY));
    setFilterErrors({});
    navigate(DEFAULT_AUDIT_QUERY);
  }

  const updating = listLoading && hasLoadedList;
  const staleRows = hasLoadedList && loadedQueryKey !== queryKey;
  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <div>
          <p className={styles.eyebrow}>Hệ thống</p>
          <h1>Nhật ký hoạt động</h1>
          <p>Theo dõi những thay đổi quan trọng và mở hồ sơ chi tiết ngay trong danh sách.</p>
        </div>
      </header>

      <AuditFilters
        draft={draft}
        errors={filterErrors}
        loading={listLoading}
        setDraft={setDraft}
        errorSummaryRef={filterErrorRef}
        onReset={resetFilters}
        onSubmit={applyFilters}
      />

      {listError === undefined ? null : (
        <InlineAlert
          ref={listErrorRef}
          tabIndex={-1}
          title="Chưa tải được nhật ký hoạt động"
          tone="danger"
        >
          <div className={styles.alertContent}>
            <span>
              {listError}
              {staleRows ? ' Danh sách bên dưới là kết quả của lần tải trước.' : ''}
            </span>
            <Button
              disabled={listLoading}
              size="compact"
              variant="secondary"
              onClick={() => {
                setListReloadKey((current) => current + 1);
              }}
            >
              Thử lại
            </Button>
          </div>
        </InlineAlert>
      )}

      <div className={styles.workspace}>
        <section className={styles.listPanel} aria-labelledby="audit-list-title">
          <div className={styles.panelHeading}>
            <div>
              <h2 id="audit-list-title">Danh sách hoạt động</h2>
              <p aria-live="polite">
                {hasLoadedList ? `${String(pagination.totalItems)} bản ghi` : 'Đang tải danh sách'}
              </p>
            </div>
            {updating ? <span className={styles.updating}>Đang cập nhật…</span> : null}
          </div>

          {!hasLoadedList && listLoading ? <AuditListSkeleton /> : null}
          {hasLoadedList && !listLoading && rows.length === 0 ? (
            <section className={styles.emptyState}>
              <ClockCounterClockwiseIcon aria-hidden="true" size={30} />
              <h3>Không có hoạt động phù hợp</h3>
              <p>Hãy thay đổi bộ lọc hoặc xóa các điều kiện hiện tại.</p>
              <Button variant="secondary" onClick={resetFilters}>
                Xóa bộ lọc
              </Button>
            </section>
          ) : null}
          {hasLoadedList && rows.length > 0 ? (
            <AuditLogList
              activeId={activeId}
              buildHref={(id) => auditWorkspaceHref(query, id)}
              onSelect={setOptimisticSelection}
              rows={rows}
              updating={updating || staleRows}
            />
          ) : null}

          {hasLoadedList && pagination.totalPages > 1 ? (
            <nav className={styles.pagination} aria-label="Phân trang nhật ký hoạt động">
              <Button
                disabled={listLoading || pagination.page <= 1}
                iconLeading={<ArrowLeftIcon aria-hidden="true" size={18} />}
                variant="secondary"
                onClick={() => {
                  navigate({ ...query, page: pagination.page - 1 });
                }}
              >
                Trang trước
              </Button>
              <span>
                Trang <strong>{pagination.page}</strong> / {pagination.totalPages}
              </span>
              <Button
                disabled={listLoading || pagination.page >= pagination.totalPages}
                iconTrailing={<ArrowRightIcon aria-hidden="true" size={18} />}
                variant="secondary"
                onClick={() => {
                  navigate({ ...query, page: pagination.page + 1 });
                }}
              >
                Trang sau
              </Button>
            </nav>
          ) : null}
        </section>

        <AuditDetailPanel
          detail={detail}
          error={detailError}
          headingRef={detailHeadingRef}
          loading={detailLoading}
          selectedId={activeId}
          onRetry={() => {
            setDetailReloadKey((current) => current + 1);
          }}
        />
      </div>
    </div>
  );
}

interface AuditFiltersProps {
  readonly draft: AuditFilterDraft;
  readonly errorSummaryRef: RefObject<HTMLDivElement | null>;
  readonly errors: AuditFilterErrors;
  readonly loading: boolean;
  readonly onReset: () => void;
  readonly onSubmit: (event: SyntheticEvent<HTMLFormElement>) => void;
  readonly setDraft: Dispatch<SetStateAction<AuditFilterDraft>>;
}

function AuditFilters({
  draft,
  errorSummaryRef,
  errors,
  loading,
  onReset,
  onSubmit,
  setDraft,
}: AuditFiltersProps) {
  const knownAction = AUDIT_ACTION_FILTERS.some((option) => option.value === draft.action);
  const advancedFilterCount = [
    draft.resourceType,
    draft.requestId,
    draft.createdFrom,
    draft.createdTo,
  ].filter((value) => value !== '').length;
  const [advancedOpen, setAdvancedOpen] = useState(advancedFilterCount > 0);
  useEffect(() => {
    if (
      advancedFilterCount > 0 ||
      errors.createdTo !== undefined ||
      errors.resourceType !== undefined
    ) {
      setAdvancedOpen(true);
    }
  }, [advancedFilterCount, errors.createdTo, errors.resourceType]);
  const summaryErrors = Object.entries(errors).map(([field, message]) => ({
    href: `#audit-${field}` as `#${string}`,
    message,
  }));
  return (
    <form className={styles.filters} aria-label="Bộ lọc nhật ký hoạt động" onSubmit={onSubmit}>
      <ErrorSummary
        ref={errorSummaryRef}
        className={styles.filterSummary}
        errors={summaryErrors}
        title="Kiểm tra lại bộ lọc"
      />
      <div className={styles.filterGrid}>
        <Select
          error={errors.action}
          id="audit-action"
          label="Nhóm hành động"
          value={draft.action}
          onChange={(event) => {
            setDraft((current) => ({ ...current, action: event.target.value }));
          }}
        >
          {!knownAction && draft.action !== '' ? (
            <option value={draft.action}>Hành động cụ thể</option>
          ) : null}
          {AUDIT_ACTION_FILTERS.map((option) => (
            <option key={option.value || 'all'} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
        <Select
          id="audit-actor-type"
          label="Người thực hiện"
          value={draft.actorType}
          onChange={(event) => {
            setDraft((current) => ({
              ...current,
              actorType: event.target.value as AuditFilterDraft['actorType'],
            }));
          }}
        >
          <option value="">Tất cả</option>
          <option value="USER">Người dùng</option>
          <option value="GUEST">Khách vãng lai</option>
          <option value="SYSTEM">Hệ thống</option>
        </Select>
        <Select
          id="audit-sort-order"
          label="Thứ tự"
          value={draft.sortOrder}
          onChange={(event) => {
            setDraft((current) => ({
              ...current,
              sortOrder: event.target.value as AuditFilterDraft['sortOrder'],
            }));
          }}
        >
          <option value="desc">Mới nhất trước</option>
          <option value="asc">Cũ nhất trước</option>
        </Select>
        <div className={styles.filterActions}>
          <Button disabled={loading} type="submit">
            Áp dụng
          </Button>
          <Button disabled={loading} type="button" variant="secondary" onClick={onReset}>
            Xóa lọc
          </Button>
        </div>
      </div>
      <details
        className={styles.advancedFilters}
        open={advancedOpen}
        onToggle={(event) => {
          setAdvancedOpen(event.currentTarget.open);
        }}
      >
        <summary>
          <span>Bộ lọc chi tiết</span>
          <small>
            {advancedFilterCount > 0
              ? `${String(advancedFilterCount)} điều kiện đang nhập`
              : 'Theo đối tượng, mã yêu cầu hoặc thời gian'}
          </small>
        </summary>
        <div className={styles.advancedGrid}>
          <Input
            error={errors.resourceType}
            id="audit-resourceType"
            label="Loại đối tượng"
            maxLength={255}
            value={draft.resourceType}
            onChange={(event) => {
              setDraft((current) => ({ ...current, resourceType: event.target.value }));
            }}
          />
          <Input
            id="audit-request-id"
            label="Mã yêu cầu"
            maxLength={64}
            value={draft.requestId}
            onChange={(event) => {
              setDraft((current) => ({ ...current, requestId: event.target.value }));
            }}
          />
          <Input
            id="audit-created-from"
            label="Từ thời điểm"
            type="datetime-local"
            value={draft.createdFrom}
            onChange={(event) => {
              setDraft((current) => ({ ...current, createdFrom: event.target.value }));
            }}
          />
          <Input
            error={errors.createdTo}
            id="audit-createdTo"
            label="Đến thời điểm"
            type="datetime-local"
            value={draft.createdTo}
            onChange={(event) => {
              setDraft((current) => ({ ...current, createdTo: event.target.value }));
            }}
          />
        </div>
      </details>
    </form>
  );
}

export function AuditLogList({
  activeId,
  buildHref,
  onSelect,
  rows,
  updating = false,
}: Readonly<{
  activeId: string | undefined;
  buildHref: (id: string) => string;
  onSelect?: (id: string) => void;
  rows: readonly AuditListRow[];
  updating?: boolean;
}>) {
  return (
    <div className={styles.auditList} aria-busy={updating || undefined}>
      {rows.map((row) => {
        const selected = row.id === activeId;
        return (
          <NextLink
            aria-current={selected ? 'page' : undefined}
            className={styles.auditRow}
            data-selected={selected || undefined}
            href={buildHref(row.id)}
            key={row.id}
            onClick={(event) => {
              if (isPlainPrimaryClick(event)) onSelect?.(row.id);
            }}
            scroll={false}
          >
            <span className={styles.avatar} aria-hidden="true">
              {row.actorInitials}
            </span>
            <span className={styles.rowCopy}>
              <strong>{row.actionLabel}</strong>
              <span>{row.actorLabel}</span>
              <small>{row.resourceLabel}</small>
            </span>
            <time dateTime={row.createdAt}>{row.createdAtLabel}</time>
            {selected ? <span className="rp-visually-hidden">Đang chọn</span> : null}
          </NextLink>
        );
      })}
    </div>
  );
}

function isPlainPrimaryClick(event: MouseEvent<HTMLAnchorElement>): boolean {
  return (
    event.button === 0 &&
    !event.altKey &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.shiftKey &&
    event.currentTarget.target !== '_blank'
  );
}

export function AuditDetailPanel({
  detail,
  error,
  headingRef,
  loading,
  onRetry,
  selectedId,
}: Readonly<{
  detail: AuditLogDetail | undefined;
  error: string | undefined;
  headingRef: RefObject<HTMLHeadingElement | null>;
  loading: boolean;
  onRetry: () => void;
  selectedId: string | undefined;
}>) {
  if (selectedId === undefined) {
    return (
      <aside className={styles.detailPanel}>
        <section className={styles.detailEmpty}>
          <ClockCounterClockwiseIcon aria-hidden="true" size={32} />
          <h2>Chi tiết hoạt động</h2>
          <p>Chọn một bản ghi trong danh sách để xem thông tin.</p>
        </section>
      </aside>
    );
  }
  if (loading) return <AuditDetailSkeleton />;
  if (error !== undefined) {
    return (
      <aside className={styles.detailPanel}>
        <InlineAlert title="Chưa mở được bản ghi" tone="danger">
          <div className={styles.alertContent}>
            <span>{error}</span>
            <Button size="compact" variant="secondary" onClick={onRetry}>
              Thử lại
            </Button>
          </div>
        </InlineAlert>
      </aside>
    );
  }
  if (detail === undefined) return <AuditDetailSkeleton />;

  const changes = humanizeAuditPayload(detail.changes);
  const metadata = humanizeAuditPayload(detail.metadata);
  const actorLabel = auditActorLabel(detail);
  const resourceLabel = auditResourceLabel(detail.resourceType);
  return (
    <aside className={styles.detailPanel} aria-labelledby="audit-detail-title">
      <div className={styles.detailHeading}>
        <p>Chi tiết hoạt động</p>
        <h2 id="audit-detail-title" ref={headingRef} tabIndex={-1}>
          {auditActionLabel(detail.action)}
        </h2>
        <span>{resourceLabel}</span>
      </div>
      <dl className={styles.detailSummary}>
        <div>
          <dt>Thời điểm</dt>
          <dd>
            <time dateTime={detail.createdAt}>{formatAuditDateTime(detail.createdAt)}</time>
          </dd>
        </div>
        <div>
          <dt>Người thực hiện</dt>
          <dd>{actorLabel}</dd>
        </div>
        <div>
          <dt>Mã đối tượng</dt>
          <dd>{detail.resourceId ?? 'Không có'}</dd>
        </div>
      </dl>
      <section className={styles.detailGroup}>
        <h3>Truy vết yêu cầu</h3>
        <dl className={styles.detailList}>
          <div>
            <dt>Mã yêu cầu</dt>
            <dd>{detail.requestId ?? 'Không có'}</dd>
          </div>
          <div>
            <dt>Địa chỉ mạng</dt>
            <dd>{detail.ipAddress ?? 'Không ghi nhận'}</dd>
          </div>
          <div>
            <dt>Thiết bị gửi yêu cầu</dt>
            <dd>{detail.userAgent ?? 'Không ghi nhận'}</dd>
          </div>
        </dl>
      </section>
      <AuditPayloadSection title="Thay đổi được ghi nhận" value={changes} />
      <AuditPayloadSection title="Thông tin bổ sung" value={metadata} />
    </aside>
  );
}

function AuditPayloadSection({
  title,
  value,
}: Readonly<{ title: string; value: AuditPayloadPresentation }>) {
  const empty = value.groups.length === 0 && value.fallbackJson === undefined;
  return (
    <section className={styles.payloadSection}>
      <h3>{title}</h3>
      {empty ? <p>Không có dữ liệu.</p> : null}
      {value.groups.map((group) => (
        <div className={styles.payloadGroup} key={group.key}>
          {group.title === undefined ? null : <h4>{group.title}</h4>}
          <dl className={styles.payloadFields}>
            {group.fields.map((field) => (
              <div key={field.key}>
                <dt>{field.label}</dt>
                <dd>{field.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      ))}
      {value.fallbackJson === undefined ? null : (
        <details className={styles.payloadFallback}>
          <summary>Dữ liệu kỹ thuật khác</summary>
          <pre>{value.fallbackJson}</pre>
        </details>
      )}
    </section>
  );
}

function AuditListSkeleton() {
  return (
    <div className={styles.listSkeleton} aria-label="Đang tải danh sách hoạt động" role="status">
      {Array.from({ length: 6 }, (_, index) => (
        <div key={index}>
          <Skeleton height="2.5rem" width="2.5rem" />
          <span>
            <Skeleton height="1rem" width="70%" />
            <Skeleton height="0.875rem" width="45%" />
          </span>
        </div>
      ))}
      <span className="rp-visually-hidden">Đang tải danh sách hoạt động…</span>
    </div>
  );
}

function AuditDetailSkeleton() {
  return (
    <aside className={styles.detailPanel} aria-label="Đang tải chi tiết hoạt động" role="status">
      <Skeleton height="1rem" width="8rem" />
      <Skeleton height="2rem" width="min(100%, 24rem)" />
      <Skeleton height="8rem" width="100%" />
      <Skeleton height="10rem" width="100%" />
      <span className="rp-visually-hidden">Đang tải chi tiết hoạt động…</span>
    </aside>
  );
}
