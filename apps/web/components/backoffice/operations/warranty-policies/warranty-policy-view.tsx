'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState, type SyntheticEvent } from 'react';
import { useAuth } from '@/app/auth-provider';
import {
  OperationsActionRail,
  OperationsDetailLayout,
  OperationsPageHeader,
  OperationsPagination,
  OperationsPanel,
} from '../operations-primitives';
import {
  focusQueueReadError,
  isCurrentQueueRequest,
  queuePageWithinTotal,
  queueReadPresentation,
} from '../queue-read-model';
import { OperationsShell } from '../operations-shell';
import { Button, InlineAlert, Input, Select, Skeleton, StatusChip } from '@/components/ui';
import {
  getWarrantyPolicy,
  listWarrantyPolicies,
  type BackofficeWarrantyPolicyDetail,
  type WarrantyPolicy,
  type WarrantyPolicyQuery,
} from '@/lib/warranty-api';
import { WarrantyPolicyEditor } from './warranty-policy-editor';
import {
  formatWarrantyPolicyDate,
  warrantyPolicyStatusPresentation,
} from './warranty-policy-presenter';
import styles from './warranty-policies.module.css';

const PAGE_SIZE = 20;

interface PolicyFilters {
  archived: '' | 'false' | 'true';
  q: string;
  status: '' | 'ACTIVE' | 'INACTIVE';
}

const DEFAULT_FILTERS: PolicyFilters = { archived: 'false', q: '', status: '' };

export function WarrantyPolicyView() {
  const { client, status: authStatus, user } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const listQueryKey = warrantyPolicyListQueryKey(searchParams);
  const filters = useMemo(
    () => filtersFromParams(new URLSearchParams(listQueryKey)),
    [listQueryKey],
  );
  const query = useMemo(() => queryFromParams(new URLSearchParams(listQueryKey)), [listQueryKey]);
  const selectedKey = searchParams.get('policy');
  const [draft, setDraft] = useState(filters);
  const [items, setItems] = useState<WarrantyPolicy[]>([]);
  const [selected, setSelected] = useState<BackofficeWarrantyPolicyDetail | null>(null);
  const [pagination, setPagination] = useState({
    page: query.page,
    pageSize: PAGE_SIZE,
    totalItems: 0,
    totalPages: 0,
  });
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editorNotice, setEditorNotice] = useState<string | null>(null);
  const [loadedQueryKey, setLoadedQueryKey] = useState<string | null>(null);
  const listErrorRef = useRef<HTMLDivElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const foregroundListLoading = useRef(false);
  const listRequest = useRef(0);
  const selectedPolicyRef = useRef<BackofficeWarrantyPolicyDetail | null>(null);
  const selectedKeyRef = useRef(selectedKey);
  const isStaff = user?.role === 'EMPLOYEE' || user?.role === 'ADMIN';
  const isAdmin = user?.role === 'ADMIN';

  useEffect(() => {
    setDraft(filters);
  }, [filters]);

  useEffect(() => {
    if (error !== null) errorRef.current?.focus();
  }, [error]);

  useEffect(() => {
    selectedKeyRef.current = selectedKey;
  }, [selectedKey]);

  useEffect(() => {
    if (listError !== null) focusQueueReadError(listErrorRef.current);
  }, [listError]);

  const loadPolicies = useCallback(
    async (background = false) => {
      if (background && foregroundListLoading.current) return;
      const request = ++listRequest.current;
      if (!background) {
        foregroundListLoading.current = true;
      }
      setLoading(true);
      setListError(null);
      try {
        const result = await listWarrantyPolicies(client, query);
        if (!isCurrentQueueRequest(request, listRequest.current)) return;
        const authoritativePage = queuePageWithinTotal(query.page, result.pagination.totalPages);
        if (authoritativePage !== query.page) {
          const params = paramsFromFilters(filters, authoritativePage);
          if (selectedKeyRef.current !== null) params.set('policy', selectedKeyRef.current);
          const suffix = params.toString();
          router.replace(suffix === '' ? pathname : `${pathname}?${suffix}`, { scroll: false });
          return;
        }
        setItems(result.data);
        setPagination(result.pagination);
        setLoadedQueryKey(listQueryKey);
      } catch (caught) {
        if (!isCurrentQueueRequest(request, listRequest.current)) return;
        setListError(messageFrom(caught, 'Không thể tải chính sách bảo hành.'));
      } finally {
        if (isCurrentQueueRequest(request, listRequest.current)) {
          if (!background) foregroundListLoading.current = false;
          setLoading(false);
        }
      }
    },
    [client, filters, listQueryKey, pathname, query, router],
  );

  useEffect(() => {
    if (authStatus !== 'authenticated' || !isStaff) return;
    void loadPolicies();
    return () => {
      listRequest.current += 1;
    };
  }, [authStatus, isStaff, loadPolicies]);

  useEffect(() => {
    if (selectedKey === null || selectedKey === 'new') {
      selectedPolicyRef.current = null;
      setSelected(null);
      setDetailLoading(false);
      return;
    }
    if (authStatus !== 'authenticated' || !isStaff) return;
    if (selectedPolicyRef.current?.id === selectedKey) {
      setDetailLoading(false);
      return;
    }
    let active = true;
    selectedPolicyRef.current = null;
    setSelected(null);
    setDetailLoading(true);
    void getWarrantyPolicy(client, selectedKey)
      .then((result) => {
        if (active) {
          selectedPolicyRef.current = result;
          setSelected(result);
        }
      })
      .catch((caught: unknown) => {
        if (active) setError(messageFrom(caught, 'Không thể mở chính sách đã chọn.'));
      })
      .finally(() => {
        if (active) setDetailLoading(false);
      });
    return () => {
      active = false;
    };
  }, [authStatus, client, isStaff, selectedKey]);

  function navigate(next: PolicyFilters, page: number, policy?: string | null) {
    const params = paramsFromFilters(next, page);
    if (policy !== undefined && policy !== null) params.set('policy', policy);
    const suffix = params.toString();
    router.replace(suffix === '' ? pathname : `${pathname}?${suffix}`, { scroll: false });
  }

  function applyFilters(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    navigate(draft, 1, null);
  }

  function selectPolicy(policy: string | null) {
    setEditorNotice(null);
    navigate(filters, pagination.page, policy);
  }

  async function reloadPolicy(policyId: string): Promise<BackofficeWarrantyPolicyDetail> {
    const policy = await getWarrantyPolicy(client, policyId);
    selectedPolicyRef.current = policy;
    setSelected(policy);
    setItems((current) => {
      const exists = current.some((item) => item.id === policy.id);
      return exists
        ? current.map((item) => (item.id === policy.id ? policy : item))
        : [policy, ...current];
    });
    void loadPolicies(true);
    navigate(filters, pagination.page, policy.id);
    return policy;
  }

  const readPresentation = queueReadPresentation(loading, listError, listQueryKey, loadedQueryKey);

  const rail = detailLoading ? (
    <OperationsPanel title="Đang mở chính sách">
      <Skeleton height="24rem" width="100%" />
    </OperationsPanel>
  ) : selectedKey === 'new' && isAdmin ? (
    <WarrantyPolicyEditor
      client={client}
      notice={editorNotice}
      policy={null}
      onNoticeChange={setEditorNotice}
      onReload={reloadPolicy}
      onClose={() => {
        selectPolicy(null);
      }}
    />
  ) : selected !== null ? (
    <WarrantyPolicyEditor
      client={client}
      notice={editorNotice}
      policy={selected}
      onNoticeChange={setEditorNotice}
      onReload={reloadPolicy}
      onClose={() => {
        selectPolicy(null);
      }}
    />
  ) : (
    <OperationsActionRail
      description="Chọn một dòng để xem nội dung và lịch sử áp dụng."
      primary={
        isAdmin ? (
          <Button
            onClick={() => {
              selectPolicy('new');
            }}
          >
            Thêm chính sách
          </Button>
        ) : undefined
      }
      title="Chi tiết chính sách"
    >
      <p className={styles.secondary}>
        {isAdmin
          ? 'Bạn cũng có thể tạo chính sách mới từ đây.'
          : 'Chỉ quản trị viên mới được thay đổi chính sách.'}
      </p>
    </OperationsActionRail>
  );

  return (
    <OperationsShell breadcrumbs={[{ label: 'Chính sách bảo hành' }]}>
      <div className={styles.page}>
        <OperationsPageHeader
          actions={
            isAdmin ? (
              <Button
                onClick={() => {
                  selectPolicy('new');
                }}
              >
                Thêm chính sách
              </Button>
            ) : undefined
          }
          description="Quản lý thời hạn và điều khoản dùng khi cấp bảo hành cho sản phẩm."
          eyebrow="Sau mua"
          meta={
            readPresentation.updating
              ? 'Đang cập nhật danh sách…'
              : `${String(pagination.totalItems)} chính sách`
          }
          title="Chính sách bảo hành"
        />

        <OperationsPanel title="Tìm chính sách">
          <form className={styles.filters} onSubmit={applyFilters}>
            <Input
              id="warranty-policy-search"
              label="Tìm kiếm"
              maxLength={255}
              placeholder="Tên hoặc mã chính sách"
              value={draft.q}
              onChange={(event) => {
                setDraft((current) => ({ ...current, q: event.target.value }));
              }}
            />
            <Select
              id="warranty-policy-status"
              label="Tình trạng áp dụng"
              value={draft.status}
              onChange={(event) => {
                setDraft((current) => ({
                  ...current,
                  status: event.target.value as PolicyFilters['status'],
                }));
              }}
            >
              <option value="">Tất cả</option>
              <option value="ACTIVE">Đang áp dụng</option>
              <option value="INACTIVE">Chưa áp dụng</option>
            </Select>
            <Select
              id="warranty-policy-archived"
              label="Phạm vi"
              value={draft.archived}
              onChange={(event) => {
                setDraft((current) => ({
                  ...current,
                  archived: event.target.value as PolicyFilters['archived'],
                }));
              }}
            >
              <option value="false">Đang quản lý</option>
              <option value="true">Đã lưu trữ</option>
              <option value="">Tất cả</option>
            </Select>
            <div className={styles.filterActions}>
              <Button loading={loading} loadingLabel="Đang lọc" type="submit">
                Áp dụng
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setDraft(DEFAULT_FILTERS);
                  navigate(DEFAULT_FILTERS, 1, null);
                }}
              >
                Mặc định
              </Button>
            </div>
          </form>
        </OperationsPanel>

        {listError === null ? null : (
          <InlineAlert
            ref={listErrorRef}
            tabIndex={-1}
            title="Chưa tải được danh sách chính sách"
            tone="danger"
          >
            <p>{listError}</p>
            {readPresentation.retainedSnapshotNotice === null ? null : (
              <p>{readPresentation.retainedSnapshotNotice}</p>
            )}
          </InlineAlert>
        )}

        {error === null ? null : (
          <InlineAlert ref={errorRef} tabIndex={-1} title="Chưa mở được chính sách" tone="danger">
            {error}
          </InlineAlert>
        )}

        <OperationsDetailLayout
          main={
            <OperationsPanel title="Danh sách chính sách">
              <div className={styles.queueMeta}>
                <p>
                  Trang {String(pagination.page)} / {String(Math.max(1, pagination.totalPages))}
                </p>
                {readPresentation.updating ? <span role="status">Đang làm mới…</span> : null}
              </div>
              {readPresentation.initialLoading ? (
                <QueueSkeleton />
              ) : items.length === 0 ? (
                <div className={styles.emptyState}>
                  <h2>Chưa có chính sách phù hợp</h2>
                  <p>Thử thay đổi từ khóa hoặc phạm vi.</p>
                </div>
              ) : (
                <WarrantyPolicyList
                  items={items}
                  selectedId={selectedKey}
                  updating={readPresentation.updating}
                  onSelect={(id) => {
                    selectPolicy(id);
                  }}
                />
              )}
              <OperationsPagination
                className={styles.pagination}
                disabled={loading}
                label="Phân trang danh sách chính sách bảo hành"
                page={pagination.page}
                totalItems={pagination.totalItems}
                totalPages={pagination.totalPages}
                onPageChange={(nextPage) => {
                  navigate(filters, nextPage, null);
                }}
              />
            </OperationsPanel>
          }
          rail={rail}
        />
      </div>
    </OperationsShell>
  );
}

export function WarrantyPolicyList({
  items,
  onSelect,
  selectedId,
  updating = false,
}: Readonly<{
  items: readonly WarrantyPolicy[];
  onSelect: (id: string) => void;
  selectedId: string | null;
  updating?: boolean;
}>) {
  return (
    <ul
      aria-busy={updating}
      className={styles.policyList}
      aria-label="Danh sách chính sách bảo hành"
    >
      {items.map((policy) => {
        const presentation = warrantyPolicyStatusPresentation(policy);
        return (
          <li className={styles.policyRow} data-selected={policy.id === selectedId} key={policy.id}>
            <div className={styles.policyCell}>
              <strong>{policy.code}</strong>
              <span>Cập nhật {formatWarrantyPolicyDate(policy.updatedAt)}</span>
            </div>
            <div className={styles.policyCell}>
              <span className={styles.rowLabel}>Tên chính sách</span>
              <strong>{policy.name}</strong>
              <span>{String(policy.defaultDays)} ngày mặc định</span>
            </div>
            <div className={styles.policyCell}>
              <span className={styles.rowLabel}>Trạng thái</span>
              <StatusChip label={presentation.label} tone={presentation.tone} />
            </div>
            <div className={styles.policyCell}>
              <span className={styles.rowLabel}>Ngày tạo</span>
              <strong>{formatWarrantyPolicyDate(policy.createdAt)}</strong>
            </div>
            <Button
              aria-label={`${policy.id === selectedId ? 'Đang xem' : 'Xem chi tiết'} chính sách ${policy.code}`}
              aria-pressed={policy.id === selectedId}
              className={styles.rowButton}
              size="compact"
              variant="secondary"
              onClick={() => {
                onSelect(policy.id);
              }}
            >
              {policy.id === selectedId ? 'Đang xem' : 'Xem chi tiết'}
            </Button>
          </li>
        );
      })}
    </ul>
  );
}

function QueueSkeleton() {
  return (
    <div className={styles.loadingState} aria-label="Đang tải chính sách" role="status">
      <div className={styles.skeletonRows}>
        <Skeleton height="4.5rem" width="100%" />
        <Skeleton height="4.5rem" width="100%" />
        <Skeleton height="4.5rem" width="100%" />
      </div>
      <span className="rp-visually-hidden">Đang tải chính sách…</span>
    </div>
  );
}

function filtersFromParams(params: Pick<URLSearchParams, 'get'>): PolicyFilters {
  const status = params.get('status');
  const archived = params.get('archived');
  return {
    archived: archived === 'true' || archived === '' ? archived : 'false',
    q: params.get('q') ?? '',
    status: status === 'ACTIVE' || status === 'INACTIVE' ? status : '',
  };
}

function queryFromParams(params: Pick<URLSearchParams, 'get'>): WarrantyPolicyQuery {
  const filters = filtersFromParams(params);
  const pageValue = Number(params.get('page') ?? '1');
  return {
    ...(filters.q.trim() === '' ? {} : { q: filters.q.trim() }),
    ...(filters.status === '' ? {} : { status: filters.status }),
    ...(filters.archived === '' ? {} : { archived: filters.archived }),
    page: Number.isInteger(pageValue) && pageValue > 0 ? pageValue : 1,
    pageSize: PAGE_SIZE,
  };
}

function paramsFromFilters(filters: PolicyFilters, page: number): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.q.trim() !== '') params.set('q', filters.q.trim());
  if (filters.status !== '') params.set('status', filters.status);
  if (filters.archived !== 'false') params.set('archived', filters.archived);
  if (page > 1) params.set('page', String(page));
  return params;
}

export function warrantyPolicyListQueryKey(params: Pick<URLSearchParams, 'toString'>): string {
  const listParams = new URLSearchParams(params.toString());
  listParams.delete('policy');
  return listParams.toString();
}

function messageFrom(value: unknown, fallback: string): string {
  return value instanceof Error ? value.message : fallback;
}
