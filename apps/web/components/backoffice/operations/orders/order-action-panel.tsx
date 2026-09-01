import { CaretDownIcon } from '@phosphor-icons/react';
import type { SyntheticEvent } from 'react';
import { Button } from '@/components/ui';
import type {
  BackofficeOrderDetail,
  BackofficeOrderLocation,
  FulfillmentAction,
} from '@/lib/fulfillment-api';
import { OperationsActionRail } from '../operations-primitives';
import { orderActionDescription, orderActionLabel } from './order-presenter';
import {
  ActionFields,
  type OrderActionSetters,
  type OrderActionValues,
} from './order-action-fields';
import styles from './orders.module.css';

export function OrderActionPanel({
  busy,
  detail,
  onSelect,
  onSubmit,
  returnLocations,
  selectedAction,
  setters,
  values,
}: Readonly<{
  busy: string | null;
  detail: BackofficeOrderDetail;
  onSelect(action: FulfillmentAction): void;
  onSubmit(event: SyntheticEvent<HTMLFormElement>): void;
  returnLocations: readonly BackofficeOrderLocation[];
  selectedAction: FulfillmentAction | null;
  setters: OrderActionSetters;
  values: OrderActionValues;
}>) {
  return (
    <OperationsActionRail title="Xử lý đơn hàng">
      {detail.availableActions.length === 0 ? (
        <p className={styles.terminalMessage}>Đơn không còn thao tác cần xử lý.</p>
      ) : (
        <div className={styles.actionChooser}>
          <OrderActionChoices
            actions={detail.availableActions}
            disabled={busy !== null}
            selectedAction={selectedAction}
            onSelect={onSelect}
          />
          {selectedAction === null ? null : (
            <details className={styles.actionDisclosure} key={selectedAction}>
              <summary>
                <span>Chi tiết {orderActionLabel(selectedAction).toLocaleLowerCase('vi-VN')}</span>
                <CaretDownIcon aria-hidden="true" size={18} weight="bold" />
              </summary>
              <form
                aria-busy={busy !== null || undefined}
                className={styles.actionForm}
                noValidate
                onSubmit={onSubmit}
              >
                <fieldset className={styles.actionFieldset} disabled={busy !== null}>
                  <div className={styles.actionIntro}>
                    <h3>{orderActionLabel(selectedAction)}</h3>
                    <p>{orderActionDescription(selectedAction)}</p>
                  </div>
                  <ActionFields
                    action={selectedAction}
                    detail={detail}
                    returnLocations={returnLocations}
                    setters={setters}
                    values={values}
                  />
                  <div className={styles.actionFooter}>
                    <Button
                      disabled={busy !== null}
                      loading={busy === selectedAction}
                      loadingLabel="Đang cập nhật đơn hàng"
                      type="submit"
                      variant={selectedAction === 'CANCEL_ORDER' ? 'destructive' : 'primary'}
                    >
                      Xác nhận {orderActionLabel(selectedAction).toLocaleLowerCase('vi-VN')}
                    </Button>
                  </div>
                </fieldset>
              </form>
            </details>
          )}
        </div>
      )}
    </OperationsActionRail>
  );
}

export function OrderActionChoices({
  actions,
  disabled = false,
  onSelect,
  selectedAction,
}: Readonly<{
  actions: readonly FulfillmentAction[];
  disabled?: boolean;
  onSelect(action: FulfillmentAction): void;
  selectedAction: FulfillmentAction | null;
}>) {
  return (
    <div className={styles.actionTabs} role="group" aria-label="Thao tác đang được phép">
      {actions.map((action) => (
        <Button
          aria-pressed={selectedAction === action}
          data-tone={action === 'CANCEL_ORDER' ? 'danger' : undefined}
          disabled={disabled}
          key={action}
          size="compact"
          variant="secondary"
          onClick={() => {
            onSelect(action);
          }}
        >
          {orderActionLabel(action)}
        </Button>
      ))}
    </div>
  );
}
