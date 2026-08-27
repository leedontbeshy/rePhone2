'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type SyntheticEvent } from 'react';
import {
  createAfterSalesRequest,
  resolveGuestOrderToken,
  type AfterSalesType,
} from '../../../lib/after-sales-api';
import { useAuth } from '../../auth-provider';
import { CatalogHeader } from '../../catalog-ui';

interface CreateContext {
  ready: boolean;
  orderItemId: string | null;
  orderNumber: string | null;
}

export default function CreateAfterSalesPage() {
  const router = useRouter();
  const { client, status, user } = useAuth();
  const isCustomer = user?.role === 'CUSTOMER';
  const isStaff = user?.role === 'EMPLOYEE' || user?.role === 'ADMIN';
  const [context, setContext] = useState<CreateContext>({
    ready: false,
    orderItemId: null,
    orderNumber: null,
  });
  const [requestType, setRequestType] = useState<AfterSalesType>('WARRANTY');
  const [issueDescription, setIssueDescription] = useState('');
  const [requestedResolution, setRequestedResolution] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tokenRef = useRef<string | undefined>(undefined);
  const errorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const search = new URLSearchParams(window.location.search);
    const orderItemId = search.get('orderItemId');
    const orderNumber = search.get('orderNumber');
    tokenRef.current = resolveGuestOrderToken(orderNumber, sessionStorage);
    setContext({ ready: true, orderItemId, orderNumber });
  }, []);

  useEffect(() => {
    if (error !== null) errorRef.current?.focus();
  }, [error]);

  const submit = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (context.orderItemId === null || context.orderNumber === null) {
      setError('Hãy mở yêu cầu từ một sản phẩm trong đơn hàng đã hoàn tất.');
      return;
    }
    const issue = issueDescription.trim();
    const resolution = requestedResolution.trim();
    if (issue.length < 10 || issue.length > 2000) {
      setError('Mô tả vấn đề phải có từ 10 đến 2.000 ký tự.');
      return;
    }
    if (resolution.length > 500) {
      setError('Mong muốn xử lý không được vượt quá 500 ký tự.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const detail = await createAfterSalesRequest(
        client,
        {
          orderItemId: context.orderItemId,
          type: requestType,
          issueDescription: issue,
          ...(resolution === '' ? {} : { requestedResolution: resolution }),
        },
        tokenRef.current,
      );
      router.replace(
        `/after-sales/${encodeURIComponent(detail.requestNumber)}?orderNumber=${encodeURIComponent(context.orderNumber)}`,
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Không thể tạo yêu cầu hậu mãi.');
    } finally {
      setSubmitting(false);
    }
  };

  const hasTarget = context.orderItemId !== null && context.orderNumber !== null;
  const guestMissingCredential =
    context.ready && status === 'anonymous' && tokenRef.current === undefined;
  const allowed = context.ready && hasTarget && !isStaff && (isCustomer || !guestMissingCredential);
  const orderHref =
    context.orderNumber === null ? '/orders' : `/orders/${encodeURIComponent(context.orderNumber)}`;

  return (
    <>
      <CatalogHeader />
      <main className="catalog-shell warranty-shell">
        <div className="breadcrumbs">
          <Link href={orderHref}>Đơn hàng</Link>
          <span>/</span>
          <span>Tạo yêu cầu hậu mãi</span>
        </div>
        <header className="warranty-page-heading">
          <div>
            <p className="eyebrow">Chăm sóc sau mua</p>
            <h1>Tạo yêu cầu hậu mãi</h1>
            <p>Chúng tôi sẽ kiểm tra sản phẩm và đơn hàng trước khi tiếp nhận yêu cầu.</p>
          </div>
        </header>

        {status === 'loading' || !context.ready ? (
          <div className="status">Đang kiểm tra thông tin đơn hàng…</div>
        ) : null}
        {isStaff ? (
          <div className="commerce-alert error" role="alert">
            Tài khoản nhân viên không thể tạo yêu cầu thay khách hàng.
          </div>
        ) : null}
        {context.ready && !hasTarget ? (
          <section className="empty-state">
            <h2>Thiếu sản phẩm cần hỗ trợ</h2>
            <p>Hãy mở một đơn đã hoàn tất và chọn “Yêu cầu hậu mãi” trên sản phẩm.</p>
            <Link className="button primary" href="/orders">
              Mở đơn hàng
            </Link>
          </section>
        ) : null}
        {guestMissingCredential ? (
          <section className="empty-state">
            <h2>Không thể xác minh đơn hàng</h2>
            <p>Hãy mở trang này từ chi tiết đơn hàng hoặc đăng nhập để tiếp tục.</p>
            <Link className="button primary" href={orderHref}>
              Mở đơn hàng
            </Link>
          </section>
        ) : null}
        {error === null ? null : (
          <div ref={errorRef} tabIndex={-1} className="commerce-alert error" role="alert">
            {error}
          </div>
        )}

        {allowed ? (
          <section className="warranty-admin-panel" aria-labelledby="create-after-sales-title">
            <h2 id="create-after-sales-title">Đơn {context.orderNumber}</h2>
            <form
              className="warranty-command-form"
              onSubmit={(event) => {
                void submit(event);
              }}
            >
              <label>
                Loại yêu cầu
                <select
                  value={requestType}
                  disabled={submitting}
                  onChange={(event) => {
                    setRequestType(event.target.value as AfterSalesType);
                  }}
                >
                  <option value="WARRANTY">Bảo hành</option>
                  <option value="RETURN">Trả hàng</option>
                  <option value="EXCHANGE">Đổi hàng</option>
                </select>
              </label>
              <label>
                Mô tả vấn đề
                <textarea
                  required
                  minLength={10}
                  maxLength={2000}
                  rows={5}
                  value={issueDescription}
                  disabled={submitting}
                  onChange={(event) => {
                    setIssueDescription(event.target.value);
                  }}
                />
              </label>
              <label>
                Mong muốn xử lý (không bắt buộc)
                <textarea
                  maxLength={500}
                  rows={3}
                  value={requestedResolution}
                  disabled={submitting}
                  onChange={(event) => {
                    setRequestedResolution(event.target.value);
                  }}
                />
              </label>
              <button className="button primary" type="submit" disabled={submitting}>
                {submitting ? 'Đang tạo yêu cầu…' : 'Gửi yêu cầu'}
              </button>
            </form>
          </section>
        ) : null}
      </main>
    </>
  );
}
