'use client';

import { Suspense } from 'react';
import { EmployeeAdminView } from '@/components/backoffice/system/users';

export default function EmployeesPage() {
  return (
    <Suspense fallback={null}>
      <EmployeeAdminView />
    </Suspense>
  );
}
