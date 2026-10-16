'use client';
import {
  StorefrontIcon as Storefront,
  CopyIcon as Copy,
  CheckIcon as Check,
} from '@phosphor-icons/react';
import { useState, type ReactNode } from 'react';
import { Button } from '@/components/ui';
import styles from './dealer.module.css';

export function DealerWorkspaceHeader({
  title,
  description,
  test,
  children,
}: {
  title: string;
  description: string;
  test: boolean;
  children?: ReactNode;
}) {
  return (
    <header className={styles.workspaceHero}>
      <div className={styles.heroLead}>
        <span className={styles.heroIcon}>
          <Storefront size={28} weight="duotone" aria-hidden />
        </span>
        <div>
          <span className={styles.eyebrow}>rePhone Partners</span>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
      </div>
      <div className={styles.heroActions}>
        {test && (
          <span className={styles.developmentNotice}>
            Dữ liệu phát triển — không chuyển tiền thật
          </span>
        )}
        {children}
      </div>
    </header>
  );
}

export function DealerCode({ code, label = 'Mã mẫu' }: { code: string; label?: string }) {
  const [copiedCode, setCopiedCode] = useState('');
  const copied = copiedCode === code;
  const [error, setError] = useState('');
  return (
    <div className={styles.codePanel}>
      <div className={styles.codeToolbar}>
        <span>{label}</span>
        <Button
          variant="ghost"
          size="compact"
          onClick={() => {
            void navigator.clipboard
              .writeText(code)
              .then(() => {
                setCopiedCode(code);
                setError('');
              })
              .catch(() => {
                setError('Chưa sao chép được. Bạn có thể chọn và chép đoạn mã bên dưới.');
              });
          }}
        >
          {copied ? <Check size={15} aria-hidden /> : <Copy size={15} aria-hidden />}
          {copied ? 'Đã chép' : 'Sao chép'}
        </Button>
      </div>
      <pre className={styles.code} tabIndex={0} aria-label={label}>
        {code}
      </pre>
      {error && <p role="status">{error}</p>}
    </div>
  );
}
