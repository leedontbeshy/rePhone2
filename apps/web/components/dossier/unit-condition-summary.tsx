import { BatteryMediumIcon, DeviceMobileIcon, WrenchIcon } from '@phosphor-icons/react/ssr';
import type { ReactNode } from 'react';
import {
  buildUnitConditionSummary,
  type UnitConditionKey,
  type UnitConditionSource,
} from './unit-condition-summary-presenter';
import styles from './unit-condition-summary.module.css';

interface UnitConditionSummaryProps {
  readonly unit: UnitConditionSource;
}

export function UnitConditionSummary({ unit }: Readonly<UnitConditionSummaryProps>) {
  const summary = buildUnitConditionSummary(unit);

  return (
    <section className={styles.summary} aria-label="Tình trạng của máy">
      <h2>Tình trạng của máy</h2>
      <dl className={styles.rows}>
        {summary.rows.map((row) => (
          <div className={styles.row} data-condition-key={row.key} key={row.key}>
            <dt>
              <span className={styles.icon} aria-hidden="true">
                {conditionIcon(row.key)}
              </span>
              <span>{row.label}</span>
            </dt>
            <dd>
              <strong>{row.value}</strong>
              {row.detail === undefined ? null : <span>{row.detail}</span>}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function conditionIcon(key: UnitConditionKey): ReactNode {
  if (key === 'appearance') return <DeviceMobileIcon size={21} />;
  if (key === 'battery') return <BatteryMediumIcon size={21} />;
  return <WrenchIcon size={21} />;
}
