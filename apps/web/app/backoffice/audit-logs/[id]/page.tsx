'use client';

import { AuditLogWorkspace } from '@/components/backoffice/system/audit/audit-workspace';
import { useParams } from 'next/navigation';

export default function AuditLogDetailPage() {
  const { id } = useParams<{ id: string }>();

  return <AuditLogWorkspace selectedId={id} />;
}
