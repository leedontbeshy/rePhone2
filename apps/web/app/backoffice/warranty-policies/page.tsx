'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState, type SyntheticEvent } from 'react';
import {
  activateWarrantyPolicy,
  archiveWarrantyPolicy,
  createWarrantyPolicy,
  deactivateWarrantyPolicy,
  getWarrantyPolicy,
  listWarrantyPolicies,
  updateWarrantyPolicy,
  type Pagination,
  type WarrantyPolicy,
  type WarrantyPolicyQuery,
} from '../../../lib/warranty-api';
import { useAuth } from '../../auth-provider';
import { CatalogHeader } from '../../catalog-ui';

const PAGE_SIZE = 20;

interface PolicyDraft {
  id?: string;
  code: string;
  name: string;
  defaultDays: string;
  terms: string;
}

interface FilterDraft {
  q: string;
  status: NonNullable<WarrantyPolicyQuery['status']>;
  archived: NonNullable<WarrantyPolicyQuery['archived']>;
}

const EMPTY_POLICY: PolicyDraft = { code: '', name: '', defaultDays: '90', terms: '' };
const DEFAULT_FILTERS: FilterDraft = { q: '', status: '', archived: 'false' };

export default function WarrantyPoliciesPage() {
  const { client, status, user } = useAuth();
  const isStaff = user?.role === 'EMPLOYEE' || user?.role === 'ADMIN';
  const isAdmin = user?.role === 'ADMIN';
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [query, setQuery] = useState<WarrantyPolicyQuery>(() => queryFrom(DEFAULT_FILTERS, 1));
  const [policies, setPolicies] = useState<WarrantyPolicy[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    pageSize: PAGE_SIZE,
    totalItems: 0,
    totalPages: 0,
  });
  const [policyDraft, setPolicyDraft] = useState<PolicyDraft>(EMPTY_POLICY);
  const [pendingAction, setPendingAction] = useState<{
    policy: WarrantyPolicy;
    action: 'deactivate' | 'archive';
  } | null>(null);
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLDivElement>(null);

  const loadPolicies = useCallback(async () => {
    const result = await listWarrantyPolicies(client, query);
    setPolicies(result.data);
    setPagination(result.pagination);
    setError(null);
  }, [client, query]);

  useEffect(() => {
    if (error !== null) errorRef.current?.focus();
  }, [error]);

  useEffect(() => {
    if (status !== 'authenticated' || !isStaff) return;
    let active = true;
    setLoading(true);
    void loadPolicies()
      .catch((caught: unknown) => {
        if (active) {
          setError(caught instanceof Error ? caught.message : 'Không thể tải chính sách bảo hành.');
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [isStaff, loadPolicies, status]);

  const submitPolicy = (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!isAdmin || busy !== null) return;
    const normalized = normalizePolicy(policyDraft);
    if (normalized instanceof Error) {
      setError(normalized.message);
      return;
    }
    const editing = policyDraft.id !== undefined;
    void runMutation(editing ? 'update' : 'create', async () => {
      if (policyDraft.id === undefined) {
        await createWarrantyPolicy(client, {
          code: normalized.code,
          name: normalized.name,
          defaultDays: normalized.defaultDays,
          terms: normalized.terms,
        });
      } else {
        await updateWarrantyPolicy(client, policyDraft.id, {
          name: normalized.name,
          defaultDays: normalized.defaultDays,
          terms: normalized.terms,
        });
      }
      setPolicyDraft(EMPTY_POLICY);
      setNotice(editing ? 'Đã cập nhật chính sách.' : 'Đã tạo chính sách ở trạng thái INACTIVE.');
    });
  };

  const editPolicy = async (policy: WarrantyPolicy) => {
    if (!isAdmin || busy !== null) return;
    setBusy(`detail:${policy.id}`);
    setError(null);
    try {
      const detail = await getWarrantyPolicy(client, policy.id);
      setPolicyDraft({
        id: detail.id,
        code: detail.code,
        name: detail.name,
        defaultDays: String(detail.defaultDays),
        terms: detail.terms,
      });
      window.requestAnimationFrame(() => formRef.current?.focus());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Không thể mở chính sách.');
    } finally {
      setBusy(null);
    }
  };

  const activate = (policy: WarrantyPolicy) => {
    void runMutation(`activate:${policy.id}`, async () => {
      await activateWarrantyPolicy(client, policy.id);
      setNotice('Đã kích hoạt chính sách.');
    });
  };

  const submitReasonAction = (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pendingAction === null || busy !== null) return;
    const normalized = reason.trim();
    if (normalized.length < 5 || normalized.length > 500) {
      setError('Lý do cần từ 5 đến 500 ký tự.');
      return;
    }
    const { policy, action } = pendingAction;
    void runMutation(`${action}:${policy.id}`, async () => {
      if (action === 'deactivate') {
        await deactivateWarrantyPolicy(client, policy.id, normalized);
        setNotice('Đã ngừng áp dụng chính sách cho giao dịch mới.');
      } else {
        await archiveWarrantyPolicy(client, policy.id, normalized);
        setNotice('Đã lưu trữ chính sách.');
      }
      setPendingAction(null);
      setReason('');
    });
  };

  const runMutation = async (key: string, operation: () => Promise<void>) => {
    setBusy(key);
    setError(null);
    setNotice(null);
    try {
      await operation();
      await loadPolicies();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Không thể cập nhật chính sách.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <CatalogHeader />
      <main className="backoffice-shell warranty-admin-shell">
        <header className="backoffice-page-heading">
          <div>
            <p className="eyebrow">Backoffice · Warranty</p>
            <h1>Chính sách bảo hành</h1>
            <p>Điều chỉnh chính sách cho giao dịch mới; snapshot lịch sử không thay đổi.</p>
          </div>
          <Link className="button" href="/backoffice/warranties">
            Bảo hành đã cấp
          </Link>
        </header>

        <RoleGate status={status} isStaff={isStaff} label="quản lý chính sách bảo hành" />
        {error === null ? null : (
          <div ref={errorRef} tabIndex={-1} className="commerce-alert error" role="alert">
            <span>{error}</span>
            <button className="button" type="button" onClick={() => void loadPolicies()}>
              Tải lại
            </button>
          </div>
        )}
        {notice === null ? null : (
          <div className="commerce-alert success" role="status" aria-live="polite">
            {notice}
          </div>
        )}

        {status === 'authenticated' && isStaff ? (
          <div className="warranty-admin-layout">
            <section>
              <form
                className="payment-review-filters warranty-filters"
                onSubmit={(event) => {
                  event.preventDefault();
                  setQuery(queryFrom(filters, 1));
                }}
              >
                <label className="filter-wide">
                  Tìm mã hoặc tên
                  <input
                    value={filters.q}
                    maxLength={255}
                    onChange={(event) => {
                      setFilters((current) => ({ ...current, q: event.target.value }));
                    }}
                  />
                </label>
                <label>
                  Trạng thái
                  <select
                    value={filters.status}
                    onChange={(event) => {
                      setFilters((current) => ({
                        ...current,
                        status: event.target.value as FilterDraft['status'],
                      }));
                    }}
                  >
                    <option value="">Tất cả</option>
                    <option value="ACTIVE">ACTIVE</option>
                    <option value="INACTIVE">INACTIVE</option>
                  </select>
                </label>
                <label>
                  Lưu trữ
                  <select
                    value={filters.archived}
                    onChange={(event) => {
                      setFilters((current) => ({
                        ...current,
                        archived: event.target.value as FilterDraft['archived'],
                      }));
                    }}
                  >
                    <option value="">Tất cả</option>
                    <option value="false">Đang dùng</option>
                    <option value="true">Đã lưu trữ</option>
                  </select>
                </label>
                <button className="button primary" type="submit" disabled={loading}>
                  Lọc
                </button>
              </form>

              <div className="warranty-list-summary" aria-live="polite">
                {loading ? 'Đang tải…' : `${String(pagination.totalItems)} chính sách`}
              </div>
              <div className="warranty-policy-list">
                {policies.map((policy) => (
                  <article className="warranty-policy-card" key={policy.id}>
                    <div>
                      <div className="warranty-card-heading">
                        <code>{policy.code}</code>
                        <span
                          className={`warranty-badge ${policy.isArchived ? 'voided' : policy.status === 'ACTIVE' ? 'valid' : 'expired'}`}
                        >
                          {policy.isArchived ? 'ARCHIVED' : policy.status}
                        </span>
                      </div>
                      <h2>{policy.name}</h2>
                      <p>
                        {String(policy.defaultDays)} ngày · {policy.terms}
                      </p>
                    </div>
                    {isAdmin && !policy.isArchived ? (
                      <div className="warranty-row-actions">
                        <button
                          className="button"
                          type="button"
                          disabled={busy !== null}
                          onClick={() => void editPolicy(policy)}
                        >
                          Sửa
                        </button>
                        {policy.status === 'ACTIVE' ? (
                          <button
                            className="button"
                            type="button"
                            disabled={busy !== null}
                            onClick={() => {
                              setPendingAction({ policy, action: 'deactivate' });
                              setReason('');
                            }}
                          >
                            Ngừng áp dụng
                          </button>
                        ) : (
                          <button
                            className="button primary"
                            type="button"
                            disabled={busy !== null}
                            onClick={() => {
                              activate(policy);
                            }}
                          >
                            Kích hoạt
                          </button>
                        )}
                        <button
                          className="button danger"
                          type="button"
                          disabled={busy !== null}
                          onClick={() => {
                            setPendingAction({ policy, action: 'archive' });
                            setReason('');
                          }}
                        >
                          Lưu trữ
                        </button>
                      </div>
                    ) : null}
                  </article>
                ))}
              </div>
              {!loading && policies.length === 0 ? (
                <section className="empty-state">
                  <h2>Không có chính sách phù hợp</h2>
                </section>
              ) : null}
              <PaginationControls
                pagination={pagination}
                loading={loading}
                onPage={(page) => {
                  setQuery((current) => ({ ...current, page }));
                }}
              />
            </section>

            {isAdmin ? (
              <aside className="warranty-admin-panel">
                <div ref={formRef} tabIndex={-1}>
                  <p className="eyebrow">
                    {policyDraft.id === undefined ? 'Tạo mới' : 'Chỉnh sửa'}
                  </p>
                  <h2>{policyDraft.id === undefined ? 'Chính sách INACTIVE' : policyDraft.code}</h2>
                </div>
                <form className="warranty-command-form" onSubmit={submitPolicy}>
                  <label>
                    Mã chính sách
                    <input
                      value={policyDraft.code}
                      disabled={policyDraft.id !== undefined || busy !== null}
                      maxLength={64}
                      onChange={(event) => {
                        setPolicyDraft((current) => ({
                          ...current,
                          code: event.target.value.toUpperCase(),
                        }));
                      }}
                    />
                  </label>
                  <label>
                    Tên
                    <input
                      value={policyDraft.name}
                      disabled={busy !== null}
                      maxLength={255}
                      onChange={(event) => {
                        setPolicyDraft((current) => ({ ...current, name: event.target.value }));
                      }}
                    />
                  </label>
                  <label>
                    Số ngày mặc định
                    <input
                      type="number"
                      min={0}
                      max={3650}
                      value={policyDraft.defaultDays}
                      disabled={busy !== null}
                      onChange={(event) => {
                        setPolicyDraft((current) => ({
                          ...current,
                          defaultDays: event.target.value,
                        }));
                      }}
                    />
                  </label>
                  <label>
                    Điều khoản
                    <textarea
                      value={policyDraft.terms}
                      disabled={busy !== null}
                      maxLength={10000}
                      rows={7}
                      onChange={(event) => {
                        setPolicyDraft((current) => ({ ...current, terms: event.target.value }));
                      }}
                    />
                  </label>
                  <div className="warranty-row-actions">
                    <button className="button primary" type="submit" disabled={busy !== null}>
                      {busy === 'create' || busy === 'update' ? 'Đang lưu…' : 'Lưu chính sách'}
                    </button>
                    {policyDraft.id === undefined ? null : (
                      <button
                        className="button"
                        type="button"
                        disabled={busy !== null}
                        onClick={() => {
                          setPolicyDraft(EMPTY_POLICY);
                        }}
                      >
                        Hủy sửa
                      </button>
                    )}
                  </div>
                </form>

                {pendingAction === null ? null : (
                  <form className="warranty-command-form danger-zone" onSubmit={submitReasonAction}>
                    <h3>
                      {pendingAction.action === 'archive' ? 'Lưu trữ' : 'Ngừng áp dụng'}{' '}
                      {pendingAction.policy.code}
                    </h3>
                    <label>
                      Lý do
                      <textarea
                        value={reason}
                        minLength={5}
                        maxLength={500}
                        rows={4}
                        disabled={busy !== null}
                        onChange={(event) => {
                          setReason(event.target.value);
                        }}
                      />
                    </label>
                    <div className="warranty-row-actions">
                      <button className="button danger" type="submit" disabled={busy !== null}>
                        Xác nhận
                      </button>
                      <button
                        className="button"
                        type="button"
                        disabled={busy !== null}
                        onClick={() => {
                          setPendingAction(null);
                        }}
                      >
                        Đóng
                      </button>
                    </div>
                  </form>
                )}
              </aside>
            ) : (
              <aside className="warranty-admin-panel">
                <h2>Quyền chỉ đọc</h2>
                <p>EMPLOYEE có thể tra cứu; chỉ ADMIN được thay đổi chính sách.</p>
              </aside>
            )}
          </div>
        ) : null}
      </main>
    </>
  );
}

function RoleGate({ status, isStaff, label }: { status: string; isStaff: boolean; label: string }) {
  if (status === 'loading') return <div className="status">Đang kiểm tra phiên đăng nhập…</div>;
  if (status === 'anonymous') {
    return (
      <section className="empty-state">
        <h2>Cần đăng nhập nhân viên</h2>
        <Link className="button primary" href="/login">
          Đăng nhập
        </Link>
      </section>
    );
  }
  return isStaff ? null : (
    <div className="commerce-alert error" role="alert">
      Bạn không có quyền {label}.
    </div>
  );
}

function PaginationControls({
  pagination,
  loading,
  onPage,
}: {
  pagination: Pagination;
  loading: boolean;
  onPage: (page: number) => void;
}) {
  return (
    <nav className="pagination" aria-label="Phân trang chính sách">
      <button
        className="button"
        type="button"
        disabled={loading || pagination.page <= 1}
        onClick={() => {
          onPage(pagination.page - 1);
        }}
      >
        Trang trước
      </button>
      <span>
        Trang {pagination.page}/{Math.max(1, pagination.totalPages)}
      </span>
      <button
        className="button"
        type="button"
        disabled={loading || pagination.page >= pagination.totalPages}
        onClick={() => {
          onPage(pagination.page + 1);
        }}
      >
        Trang sau
      </button>
    </nav>
  );
}

function queryFrom(filters: FilterDraft, page: number): WarrantyPolicyQuery {
  return {
    page,
    pageSize: PAGE_SIZE,
    ...(filters.q.trim() === '' ? {} : { q: filters.q.trim() }),
    status: filters.status,
    archived: filters.archived,
  };
}

function normalizePolicy(
  draft: PolicyDraft,
): { code: string; name: string; defaultDays: number; terms: string } | Error {
  const code = draft.code.trim().toUpperCase();
  const name = draft.name.trim();
  const terms = draft.terms.trim();
  const defaultDays = Number(draft.defaultDays);
  if (code.length < 1 || code.length > 64) return new Error('Mã chính sách cần từ 1 đến 64 ký tự.');
  if (name.length < 1 || name.length > 255)
    return new Error('Tên chính sách cần từ 1 đến 255 ký tự.');
  if (!Number.isInteger(defaultDays) || defaultDays < 0 || defaultDays > 3650)
    return new Error('Số ngày phải là số nguyên từ 0 đến 3650.');
  if (terms.length < 1 || terms.length > 10000)
    return new Error('Điều khoản cần từ 1 đến 10.000 ký tự.');
  return { code, name, defaultDays, terms };
}
