import {
  CheckCircleIcon,
  MinusCircleIcon,
  WarningCircleIcon,
  XCircleIcon,
} from '@phosphor-icons/react/ssr';
import type { UsedIphoneDetail } from '@/lib/catalog-api';
import { catalogLabel } from '@/lib/catalog-presenters';
import styles from './dossier.module.css';

type FunctionalCheck = UsedIphoneDetail['unit']['functionalChecks'][number];
type FunctionalCheckStatus = FunctionalCheck['status'];

interface PublicInspectionSummaryProps {
  readonly inventoryCode: string;
  readonly checks: readonly FunctionalCheck[];
}

export function PublicInspectionSummary({ checks, inventoryCode }: PublicInspectionSummaryProps) {
  if (checks.length === 0) return null;

  return (
    <section className={styles.inspectionOverview} aria-labelledby="inspection-overview-title">
      <div className={styles.inspectionIntro}>
        <p className={styles.eyebrow}>Kiểm tra trước khi bán</p>
        <h2 id="inspection-overview-title">Máy đã được kiểm tra kỹ thuật</h2>
        <p>Các kết quả tiêu biểu dưới đây được ghi nhận riêng cho máy mã {inventoryCode}.</p>
      </div>
      <ul className={styles.inspectionPreview}>
        {checks.slice(0, 5).map((check) => (
          <li data-inspection-summary-check data-tone={checkTone(check.status)} key={check.key}>
            <InspectionStatusIcon status={check.status} />
            <span>
              <strong>{check.label}</strong>
              <small>{catalogLabel(check.status)}</small>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function checkTone(status: FunctionalCheckStatus): 'danger' | 'neutral' | 'success' | 'warning' {
  if (status === 'PASS') return 'success';
  if (status === 'NOT_APPLICABLE') return 'neutral';
  if (status === 'FAIL') return 'danger';
  return 'warning';
}

function InspectionStatusIcon({ status }: { readonly status: FunctionalCheckStatus }) {
  if (status === 'PASS') {
    return <CheckCircleIcon aria-hidden="true" size={20} weight="bold" />;
  }
  if (status === 'NOT_APPLICABLE') {
    return <MinusCircleIcon aria-hidden="true" size={20} weight="bold" />;
  }
  if (status === 'FAIL') {
    return <XCircleIcon aria-hidden="true" size={20} weight="bold" />;
  }
  return <WarningCircleIcon aria-hidden="true" size={20} weight="bold" />;
}
