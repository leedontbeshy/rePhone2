'use client';

import type { components } from '@rephone/api-client';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState, type SyntheticEvent } from 'react';
import { useAuth } from '@/app/auth-provider';
import {
  CollectionLoading,
  DetailGrid,
  DetailPanel,
  ErrorState,
  PostPurchasePageHeader,
  SafeNotFoundState,
} from '@/components/post-purchase';
import { Button, InlineAlert } from '@/components/ui';
import {
  AfterSalesCustomerError,
  createAfterSalesRequest,
  getCompletedAfterSalesOrder,
  getAfterSalesOrderItem,
  listCompletedAfterSalesOrders,
  resolveGuestOrderToken,
  type AfterSalesType,
  type AfterSalesOrderChoice,
  type AfterSalesEligibleOrder,
} from '@/lib/after-sales-api';
import { removeGuestOrderToken } from '@/lib/order-access';
import styles from './after-sales.module.css';
import { AfterSalesProductSummary } from './product-summary';

type OrderItem = components['schemas']['OrderItemDto'];

export function AfterSalesCreate() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const orderNumber = searchParams.get('orderNumber');
  const orderItemId = searchParams.get('orderItemId');
  const { client, status, user } = useAuth();
  const [item, setItem] = useState<OrderItem | null>(null);
  const [itemAccessKey, setItemAccessKey] = useState('');
  const [loading, setLoading] = useState(true);
  const [requestType, setRequestType] = useState<AfterSalesType>('WARRANTY');
  const [issue, setIssue] = useState('');
  const [outcome, setOutcome] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [orderChoices, setOrderChoices] = useState<AfterSalesOrderChoice[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<AfterSalesEligibleOrder | null>(null);
  const [selectionLoading, setSelectionLoading] = useState(false);
  const [selectionError, setSelectionError] = useState<string | null>(null);
  const guestTokenRef = useRef<string | undefined>(undefined);
  const generationRef = useRef(0);
  const selectionGenerationRef = useRef(0);
  const isStaff =
    status === 'authenticated' && (user?.role === 'EMPLOYEE' || user?.role === 'ADMIN');
  const accessKey = `${orderNumber ?? ''}\u0000${orderItemId ?? ''}\u0000${status}\u0000${user?.role ?? ''}\u0000${user?.id ?? ''}`;
  const visibleItem = itemAccessKey === accessKey ? item : null;

  useEffect(() => {
    const generation = ++generationRef.current;
    setItem(null);
    setItemAccessKey('');
    setError(null);
    setNotFound(false);
    setSubmitting(false);
    guestTokenRef.current = undefined;
    if (status === 'loading') return;
    if (orderNumber === null || orderItemId === null || isStaff) {
      setLoading(false);
      return;
    }
    const guestToken =
      status === 'anonymous' ? resolveGuestOrderToken(orderNumber, sessionStorage) : undefined;
    guestTokenRef.current = guestToken;
    setLoading(true);
    void getAfterSalesOrderItem(client, orderNumber, orderItemId, guestToken)
      .then((next) => {
        if (generationRef.current !== generation) return;
        setItem(next);
        setItemAccessKey(accessKey);
      })
      .catch((caught: unknown) => {
        if (generationRef.current !== generation) return;
        if (caught instanceof AfterSalesCustomerError && caught.notFound) {
          setNotFound(true);
          if (status === 'anonymous') {
            removeGuestOrderToken(orderNumber.trim().toUpperCase(), sessionStorage);
          }
        } else
          setError(caught instanceof Error ? caught.message : 'Không thể mở sản phẩm cần hỗ trợ.');
      })
      .finally(() => {
        if (generationRef.current === generation) setLoading(false);
      });
    return () => {
      if (generationRef.current === generation) generationRef.current += 1;
    };
  }, [accessKey, client, isStaff, orderItemId, orderNumber, status]);

  useEffect(() => {
    const generation = ++selectionGenerationRef.current;
    setOrderChoices([]);
    setSelectedOrder(null);
    setSelectionError(null);
    if (
      orderNumber !== null ||
      orderItemId !== null ||
      status !== 'authenticated' ||
      user?.role !== 'CUSTOMER'
    ) {
      setSelectionLoading(false);
      return;
    }
    let active = true;
    setSelectionLoading(true);
    void listCompletedAfterSalesOrders(client)
      .then((orders) => {
        if (active && selectionGenerationRef.current === generation) setOrderChoices(orders);
      })
      .catch((caught: unknown) => {
        if (active && selectionGenerationRef.current === generation) {
          setSelectionError(caught instanceof Error ? caught.message : 'Không thể tải đơn hàng.');
        }
      })
      .finally(() => {
        if (active && selectionGenerationRef.current === generation) setSelectionLoading(false);
      });
    return () => {
      active = false;
    };
  }, [client, orderItemId, orderNumber, status, user?.id, user?.role]);

  async function chooseOrder(nextOrderNumber: string) {
    const generation = ++selectionGenerationRef.current;
    setSelectedOrder(null);
    if (!nextOrderNumber) {
      setSelectionLoading(false);
      return;
    }
    setSelectionLoading(true);
    setSelectionError(null);
    try {
      const nextOrder = await getCompletedAfterSalesOrder(client, nextOrderNumber);
      if (selectionGenerationRef.current === generation) setSelectedOrder(nextOrder);
    } catch (caught) {
      if (selectionGenerationRef.current === generation) {
        setSelectionError(caught instanceof Error ? caught.message : 'Không thể mở đơn hàng.');
      }
    } finally {
      if (selectionGenerationRef.current === generation) setSelectionLoading(false);
    }
  }

  async function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (visibleItem === null || orderNumber === null) return;
    const normalizedIssue = issue.trim();
    const normalizedOutcome = outcome.trim();
    if (normalizedIssue.length < 10 || normalizedIssue.length > 2000) {
      setError('Mô tả vấn đề cần có từ 10 đến 2.000 ký tự.');
      return;
    }
    if (normalizedOutcome.length > 500 || (outcome.length > 0 && normalizedOutcome.length === 0)) {
      setError('Mong muốn hỗ trợ không được để trống và tối đa 500 ký tự.');
      return;
    }
    const generation = generationRef.current;
    const accessOrderNumber = orderNumber;
    const accessItemId = visibleItem.id;
    const accessToken = status === 'anonymous' ? guestTokenRef.current : undefined;
    setSubmitting(true);
    setError(null);
    try {
      const detail = await createAfterSalesRequest(
        client,
        {
          orderItemId: accessItemId,
          type: requestType,
          issueDescription: normalizedIssue,
          ...(normalizedOutcome ? { requestedResolution: normalizedOutcome } : {}),
        },
        accessToken,
      );
      if (generationRef.current !== generation) return;
      router.replace(
        `/after-sales/${encodeURIComponent(detail.requestNumber)}?orderNumber=${encodeURIComponent(accessOrderNumber)}`,
      );
    } catch (caught) {
      if (generationRef.current !== generation) return;
      if (caught instanceof AfterSalesCustomerError && caught.notFound) {
        if (accessToken) {
          removeGuestOrderToken(accessOrderNumber.trim().toUpperCase(), sessionStorage);
        }
        setItem(null);
        setItemAccessKey('');
        setNotFound(true);
      } else {
        setError(caught instanceof Error ? caught.message : 'Không thể gửi yêu cầu hỗ trợ.');
      }
    } finally {
      if (generationRef.current === generation) setSubmitting(false);
    }
  }

  const missingContext = orderNumber === null || orderItemId === null;
  const selectionContext = orderNumber === null && orderItemId === null;
  const incompleteContext = missingContext && !selectionContext;
  return (
    <div className={styles.page}>
      <PostPurchasePageHeader
        title="Tạo yêu cầu hỗ trợ"
        description="Cho rePhone biết sản phẩm đang gặp vấn đề gì."
      />
      {status === 'loading' || loading ? (
        <CollectionLoading label="Đang kiểm tra sản phẩm…" />
      ) : null}
      {isStaff ? (
        <ErrorState message="Tài khoản này không thể tạo yêu cầu thay khách hàng." />
      ) : null}
      {!loading && selectionContext && status === 'authenticated' && user?.role === 'CUSTOMER' ? (
        <DetailPanel title="Chọn sản phẩm cần hỗ trợ">
          <div className={styles.selector}>
            {selectionLoading ? <CollectionLoading label="Đang tải sản phẩm…" /> : null}
            {selectionError ? <ErrorState message={selectionError} /> : null}
            {!selectionLoading && !selectionError && orderChoices.length === 0 ? (
              <p className={styles.muted}>Bạn chưa có đơn hàng đã hoàn tất.</p>
            ) : null}
            {orderChoices.length > 0 ? (
              <label className={styles.field}>
                Đơn hàng đã hoàn tất
                <select
                  defaultValue=""
                  disabled={selectionLoading}
                  onChange={(event) => void chooseOrder(event.target.value)}
                >
                  <option value="">Chọn đơn hàng</option>
                  {orderChoices.map((order) => (
                    <option key={order.orderNumber} value={order.orderNumber}>
                      {order.orderNumber} · {order.firstItemName}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {selectedOrder ? (
              <div className={styles.itemChoices}>
                {selectedOrder.items.map((choice) => (
                  <button
                    className={styles.itemChoice}
                    type="button"
                    key={choice.id}
                    onClick={() => {
                      router.replace(
                        `/after-sales/new?orderNumber=${encodeURIComponent(selectedOrder.orderNumber)}&orderItemId=${encodeURIComponent(choice.id)}`,
                      );
                    }}
                  >
                    <AfterSalesProductSummary
                      name={choice.productName}
                      productType={choice.productType}
                      secondary={choice.variantName}
                    />
                    <span>Chọn sản phẩm</span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </DetailPanel>
      ) : null}
      {!loading && selectionContext && status !== 'authenticated' ? (
        <SafeNotFoundState title="Đăng nhập để chọn sản phẩm" />
      ) : null}
      {!loading && incompleteContext ? (
        <SafeNotFoundState title="Chưa chọn đủ thông tin sản phẩm" />
      ) : null}
      {!loading &&
      !missingContext &&
      !isStaff &&
      visibleItem === null &&
      (notFound || error === null) ? (
        <SafeNotFoundState />
      ) : null}
      {error ? <InlineAlert tone="danger">{error}</InlineAlert> : null}

      {!loading && visibleItem !== null && !isStaff ? (
        <DetailGrid>
          <DetailPanel title="Sản phẩm cần hỗ trợ">
            <div className={styles.stack}>
              <AfterSalesProductSummary
                name={visibleItem.productName}
                productType={visibleItem.productType}
                secondary={visibleItem.variantName}
              />
              <span className={styles.muted}>Đơn hàng {orderNumber}</span>
              <Link className={styles.secondaryLink} href="/after-sales/new">
                Chọn sản phẩm khác
              </Link>
            </div>
          </DetailPanel>
          <DetailPanel className={styles.formPanel} title="Thông tin yêu cầu">
            <form className={styles.form} onSubmit={(event) => void submit(event)}>
              <fieldset className={styles.choiceGrid}>
                <legend className="rp-visually-hidden">Bạn cần hỗ trợ về việc gì?</legend>
                {REQUEST_TYPES.map((choice) => (
                  <label className={styles.choice} key={choice.value}>
                    <input
                      type="radio"
                      name="requestType"
                      value={choice.value}
                      checked={requestType === choice.value}
                      disabled={submitting}
                      onChange={() => {
                        setRequestType(choice.value);
                      }}
                    />
                    <span>{choice.label}</span>
                  </label>
                ))}
              </fieldset>
              <label className={styles.field}>
                Sản phẩm đang gặp vấn đề gì?
                <textarea
                  required
                  minLength={10}
                  maxLength={2000}
                  value={issue}
                  disabled={submitting}
                  onChange={(event) => {
                    setIssue(event.target.value);
                  }}
                />
                <span className={styles.counter}>{issue.length}/2.000 ký tự</span>
              </label>
              <label className={styles.field}>
                Bạn mong muốn được hỗ trợ thế nào? (không bắt buộc)
                <textarea
                  maxLength={500}
                  value={outcome}
                  disabled={submitting}
                  onChange={(event) => {
                    setOutcome(event.target.value);
                  }}
                />
                <span className={styles.counter}>{outcome.length}/500 ký tự</span>
              </label>
              <p className={styles.attachmentHint}>
                Sau khi gửi yêu cầu, bạn có thể bổ sung ảnh hoặc tài liệu.
              </p>
              <div className={styles.actions}>
                <Link
                  className={styles.secondaryLink}
                  href={
                    orderNumber === null ? '/orders' : `/orders/${encodeURIComponent(orderNumber)}`
                  }
                >
                  Quay lại đơn hàng
                </Link>
                <Button type="submit" loading={submitting} loadingLabel="Đang gửi yêu cầu">
                  Gửi yêu cầu hỗ trợ
                </Button>
              </div>
            </form>
          </DetailPanel>
        </DetailGrid>
      ) : null}
    </div>
  );
}

const REQUEST_TYPES: readonly { value: AfterSalesType; label: string }[] = [
  { value: 'WARRANTY', label: 'Yêu cầu bảo hành' },
  { value: 'EXCHANGE', label: 'Yêu cầu đổi sản phẩm' },
  { value: 'RETURN', label: 'Yêu cầu trả sản phẩm' },
];
