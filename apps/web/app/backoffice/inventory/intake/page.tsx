import { Suspense } from 'react';
import { InventoryIntakeWizard } from './wizard';

export default function InventoryIntakePage() {
  return (
    <Suspense
      fallback={
        <main className="backoffice-shell">
          <div className="status">Đang mở quy trình nhập máy…</div>
        </main>
      }
    >
      <InventoryIntakeWizard />
    </Suspense>
  );
}
