import {
  CalendarBlankIcon,
  CheckCircleIcon,
  ClipboardTextIcon,
  CreditCardIcon,
  HeadsetIcon,
  MagnifyingGlassIcon,
  PackageIcon,
  ShieldCheckIcon,
  StorefrontIcon,
  TruckIcon,
  WarningCircleIcon,
  XCircleIcon,
} from '@phosphor-icons/react/ssr';
import type { ComponentType } from 'react';
import type { IconProps } from '@phosphor-icons/react';
import styles from './lifecycle-journey.module.css';

export type LifecycleStageState = 'complete' | 'current' | 'upcoming' | 'terminal';
export type LifecycleTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';
export type LifecycleIconName =
  | 'calendar'
  | 'cancelled'
  | 'complete'
  | 'confirmed'
  | 'decision'
  | 'failed'
  | 'inspection'
  | 'order'
  | 'package'
  | 'payment'
  | 'pickup'
  | 'received'
  | 'shipping'
  | 'support'
  | 'warranty';

export interface LifecycleStage {
  readonly at?: string | null | undefined;
  readonly icon: LifecycleIconName;
  readonly id: string;
  readonly label: string;
  readonly state: LifecycleStageState;
  readonly summary?: string | undefined;
  readonly tone?: LifecycleTone | undefined;
}

export interface LifecycleJourneyProps {
  readonly ariaLabel: string;
  readonly currentSummary?: string | undefined;
  readonly stages: readonly LifecycleStage[];
  readonly title: string;
}

const ICONS: Readonly<Record<LifecycleIconName, ComponentType<IconProps>>> = {
  calendar: CalendarBlankIcon,
  cancelled: XCircleIcon,
  complete: CheckCircleIcon,
  confirmed: ShieldCheckIcon,
  decision: ClipboardTextIcon,
  failed: WarningCircleIcon,
  inspection: MagnifyingGlassIcon,
  order: ClipboardTextIcon,
  package: PackageIcon,
  payment: CreditCardIcon,
  pickup: StorefrontIcon,
  received: CheckCircleIcon,
  shipping: TruckIcon,
  support: HeadsetIcon,
  warranty: ShieldCheckIcon,
};

export function LifecycleJourney({
  ariaLabel,
  currentSummary,
  stages,
  title,
}: LifecycleJourneyProps) {
  const currentIndex = stages.findIndex(
    (stage) => stage.state === 'current' || stage.state === 'terminal',
  );
  const currentStage = currentIndex >= 0 ? stages[currentIndex] : undefined;
  const currentDescription = currentSummary ?? currentStage?.summary ?? '';

  return (
    <section className={styles.panel} aria-labelledby={`${slug(title)}-journey-title`}>
      <h2 id={`${slug(title)}-journey-title`} className={styles.title}>
        {title}
      </h2>
      {currentStage === undefined ? null : (
        <>
          <p className="rp-visually-hidden">
            Hiện tại: {currentStage.label}
            {currentDescription ? `. ${currentDescription}` : ''}
          </p>
          <div className={styles.mobileSummary} aria-hidden="true">
            <LifecycleIcon name={currentStage.icon} size={30} />
            <div>
              <strong>{currentStage.label}</strong>
              {currentDescription ? <p>{currentDescription}</p> : null}
            </div>
          </div>
        </>
      )}
      <ol className={styles.journey} aria-label={ariaLabel}>
        {stages.map((stage, index) => (
          <li
            className={styles.stage}
            data-state={stage.state}
            data-tone={stage.tone ?? 'info'}
            key={stage.id}
            aria-current={
              stage.state === 'current' || stage.state === 'terminal' ? 'step' : undefined
            }
            aria-label={`${stage.label}${stage.at ? `, ${stage.at}` : ''}`}
          >
            <span className={styles.marker} aria-hidden="true">
              <LifecycleIcon name={stage.icon} size={26} />
            </span>
            <span className={styles.stageCopy}>
              <strong>{stage.label}</strong>
              {stage.at ? <span>{stage.at}</span> : null}
            </span>
            {index < stages.length - 1 ? (
              <span className={styles.connector} aria-hidden="true" />
            ) : null}
          </li>
        ))}
      </ol>
      {currentStage === undefined ? null : (
        <p className={styles.mobileProgress} aria-hidden="true">
          Bước {currentIndex + 1} trên {stages.length}
        </p>
      )}
    </section>
  );
}

export function LifecycleIcon({
  name,
  size = 24,
}: Readonly<{ name: LifecycleIconName; size?: number }>) {
  const Icon = ICONS[name];
  return <Icon aria-hidden="true" size={size} weight="regular" />;
}

function slug(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}
