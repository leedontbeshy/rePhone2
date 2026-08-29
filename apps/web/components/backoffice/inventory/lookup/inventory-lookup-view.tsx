'use client';

import { ArrowRightIcon, IdentificationCardIcon, ShieldCheckIcon } from '@phosphor-icons/react/ssr';
import Link from 'next/link';
import { useState, type SyntheticEvent } from 'react';
import { Button, InlineAlert, Input, Select, StatusChip } from '@/components/ui';
import styles from './inventory-lookup.module.css';

export type InventoryLookupIdentifierType = 'IMEI' | 'SERIAL' | 'EID';
export type InventoryMaskedIdentifierType = 'IMEI_1' | 'IMEI_2' | 'SERIAL' | 'EID';

export interface InventoryLookupResult {
  readonly id: string;
  readonly inventoryCode: string;
  readonly lifecycleLabel: string;
  readonly lifecycleTone: 'neutral' | 'info' | 'success' | 'warning' | 'danger';
  readonly locationName: string;
  readonly maskedIdentifiers: readonly {
    maskedValue: string;
    type: InventoryMaskedIdentifierType;
  }[];
  readonly productName: string;
  readonly variantName: string;
}

export interface InventoryLookupInput {
  readonly identifier: string;
  readonly identifierType: InventoryLookupIdentifierType;
}

export interface InventoryLookupViewProps {
  readonly onLookup: (input: InventoryLookupInput) => Promise<InventoryLookupResult>;
}

export function InventoryLookupView({ onLookup }: InventoryLookupViewProps) {
  const [identifierType, setIdentifierType] = useState<InventoryLookupIdentifierType>('IMEI');
  const [identifier, setIdentifier] = useState('');
  const [attempted, setAttempted] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<InventoryLookupResult | null>(null);
  const validation = validateInventoryLookupInput({ identifier, identifierType });

  async function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setAttempted(true);
    setError(null);
    setResult(null);
    if (validation.identifier !== undefined) return;

    setPending(true);
    try {
      const found = await onLookup({
        identifier: identifier.trim(),
        identifierType,
      });
      setResult(found);
      setIdentifier('');
      setAttempted(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Chưa thể tra cứu mã máy.');
      setIdentifier('');
      setAttempted(false);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <p className={styles.eyebrow}>Kho hàng · Bảo vệ định danh</p>
        <h1>Tra cứu mã máy</h1>
        <p>Tìm đúng máy bằng IMEI, số sê-ri hoặc EID; kết quả chỉ hiển thị mã đã che.</p>
      </header>

      <div className={styles.layout}>
        <form
          className={styles.formCard}
          onSubmit={(event) => {
            void submit(event);
          }}
        >
          <div className={styles.cardHeading}>
            <IdentificationCardIcon aria-hidden="true" size={24} />
            <div>
              <h2>Thông tin tra cứu</h2>
              <p>Mỗi lần tra cứu được tự động ghi nhận để bảo vệ thông tin máy.</p>
            </div>
          </div>

          <div className={styles.fieldGrid}>
            <Select
              disabled={pending}
              id="inventory-identifier-type"
              label="Loại mã"
              value={identifierType}
              onChange={(event) => {
                setIdentifierType(event.target.value as InventoryLookupIdentifierType);
                setIdentifier('');
                setResult(null);
              }}
            >
              <option value="IMEI">IMEI</option>
              <option value="SERIAL">Số sê-ri</option>
              <option value="EID">EID</option>
            </Select>
            <Input
              autoComplete="off"
              disabled={pending}
              error={attempted ? validation.identifier : undefined}
              id="inventory-identifier-value"
              inputMode={identifierType === 'SERIAL' ? 'text' : 'numeric'}
              label={identifierInputLabel(identifierType)}
              placeholder={identifierPlaceholder(identifierType)}
              required
              value={identifier}
              onChange={(event) => {
                setIdentifier(event.target.value);
                setResult(null);
              }}
            />
          </div>

          {error === null ? null : (
            <InlineAlert title="Không tìm được máy" tone="danger">
              {error}
            </InlineAlert>
          )}

          <div className={styles.formActions}>
            <Button loading={pending} loadingLabel="Đang tra cứu" type="submit">
              Tra cứu
            </Button>
            <p>Mã đầy đủ sẽ được xóa khỏi ô nhập ngay sau khi gửi.</p>
          </div>
        </form>

        <aside className={styles.securityCard}>
          <ShieldCheckIcon aria-hidden="true" size={30} weight="duotone" />
          <h2>Thông tin được bảo vệ</h2>
          <p>
            Kết quả chỉ hiển thị mã đã che. Nếu cần xem đầy đủ trong hồ sơ máy, bạn phải nhập một lý
            do mới.
          </p>
          <ul>
            <li>Mã đầy đủ không xuất hiện trong đường dẫn</li>
            <li>Ô nhập được xóa ngay sau khi tra cứu</li>
            <li>Mọi lần tra cứu đều được ghi nhận</li>
          </ul>
        </aside>
      </div>

      {result === null ? null : <LookupResultCard result={result} />}
    </div>
  );
}

function LookupResultCard({ result }: Readonly<{ result: InventoryLookupResult }>) {
  return (
    <section className={styles.resultCard} aria-live="polite">
      <div className={styles.resultHeading}>
        <div>
          <p>Đã tìm thấy máy</p>
          <h2>{result.productName}</h2>
          <span>
            {result.variantName} · {result.inventoryCode}
          </span>
        </div>
        <StatusChip label={result.lifecycleLabel} tone={result.lifecycleTone} />
      </div>
      <dl className={styles.resultFacts}>
        <div>
          <dt>Địa điểm</dt>
          <dd>{result.locationName}</dd>
        </div>
        <div>
          <dt>Định danh</dt>
          <dd>
            {result.maskedIdentifiers.length === 0
              ? 'Chưa có dữ liệu hiển thị'
              : result.maskedIdentifiers
                  .map((item) => `${identifierTypeLabel(item.type)} ${item.maskedValue}`)
                  .join(' · ')}
          </dd>
        </div>
      </dl>
      <Link className={styles.detailLink} href={`/backoffice/inventory/units/${result.id}`}>
        Mở hồ sơ máy
        <ArrowRightIcon aria-hidden="true" size={18} />
      </Link>
    </section>
  );
}

export function validateInventoryLookupInput(input: InventoryLookupInput): {
  identifier?: string;
} {
  const identifier = input.identifier.trim();
  let identifierError: string | undefined;
  if (identifier === '') identifierError = 'Hãy nhập mã cần tra cứu.';
  else if (input.identifierType === 'IMEI') {
    if (!/^\d{15}$/.test(identifier.replace(/[\s-]/g, '')))
      identifierError = 'IMEI cần có đúng 15 chữ số.';
  } else if (input.identifierType === 'EID') {
    if (!/^\d{32}$/.test(identifier.replace(/\s/g, '')))
      identifierError = 'EID cần có đúng 32 chữ số.';
  } else if (!/^[a-zA-Z0-9\s-]{6,32}$/.test(identifier)) {
    identifierError = 'Số sê-ri cần từ 6 đến 32 ký tự chữ hoặc số.';
  }

  return identifierError === undefined ? {} : { identifier: identifierError };
}

export function identifierTypeLabel(
  type: InventoryMaskedIdentifierType | InventoryLookupIdentifierType,
): string {
  if (type === 'IMEI') return 'IMEI';
  if (type === 'IMEI_1') return 'IMEI chính';
  if (type === 'IMEI_2') return 'IMEI phụ';
  if (type === 'SERIAL') return 'Số sê-ri';
  return 'EID';
}

function identifierInputLabel(type: InventoryLookupIdentifierType): string {
  return type === 'SERIAL' ? 'Số sê-ri đầy đủ' : `${identifierTypeLabel(type)} đầy đủ`;
}

function identifierPlaceholder(type: InventoryLookupIdentifierType): string {
  if (type === 'SERIAL') return 'Ví dụ: F2LX1234ABCD';
  if (type === 'EID') return '32 chữ số';
  return '15 chữ số';
}
