'use client';

import { CheckCircleIcon } from '@phosphor-icons/react/ssr';
import { useEffect, useRef } from 'react';
import { classNames } from '@/components/ui/class-names';
import styles from './inventory-workflow-progress.module.css';

export type InventoryWorkflowStep = 1 | 2 | 3 | 4 | 5;

const STEPS: ReadonlyArray<{ readonly label: string; readonly number: InventoryWorkflowStep }> = [
  { number: 1, label: 'Tiếp nhận' },
  { number: 2, label: 'Ảnh thực tế' },
  { number: 3, label: 'Kiểm định' },
  { number: 4, label: 'Sẵn sàng bán' },
  { number: 5, label: 'Trang sản phẩm' },
];

export function InventoryWorkflowProgress({
  completedSteps,
  currentStep,
}: Readonly<{
  completedSteps: readonly InventoryWorkflowStep[];
  currentStep: InventoryWorkflowStep;
}>) {
  const completed = new Set(completedSteps);
  const currentStepRef = useRef<HTMLLIElement>(null);

  useEffect(() => {
    const current = currentStepRef.current;
    const progress = current?.parentElement;
    if (
      current === null ||
      progress === null ||
      progress === undefined ||
      progress.scrollWidth <= progress.clientWidth
    )
      return;
    const targetLeft = current.offsetLeft - (progress.clientWidth - current.offsetWidth) / 2;
    progress.scrollTo({ behavior: 'auto', left: Math.max(0, targetLeft) });
  }, [currentStep]);

  return (
    <ol className={styles.progress} aria-label="Tiến độ nhập máy" tabIndex={0}>
      {STEPS.map((step) => {
        const done = completed.has(step.number);
        const current = currentStep === step.number;
        return (
          <li
            className={classNames(done && styles.done, current && styles.current)}
            aria-current={current ? 'step' : undefined}
            key={step.number}
            ref={current ? currentStepRef : undefined}
          >
            <span aria-hidden="true">
              {done ? <CheckCircleIcon size={22} weight="fill" /> : step.number}
            </span>
            <strong>{step.label}</strong>
            <span className="rp-visually-hidden">
              {done ? 'Đã hoàn tất' : current ? 'Bước hiện tại' : 'Chưa hoàn tất'}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
