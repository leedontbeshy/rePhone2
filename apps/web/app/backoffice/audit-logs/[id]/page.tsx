import { redirect } from 'next/navigation';

interface AuditLogLegacyDetailPageProps {
  readonly params: Promise<{ id: string }>;
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function AuditLogLegacyDetailPage({
  params,
  searchParams,
}: AuditLogLegacyDetailPageProps) {
  const [{ id }, currentSearch] = await Promise.all([params, searchParams]);
  const nextSearch = new URLSearchParams();
  for (const [key, value] of Object.entries(currentSearch)) {
    if (value === undefined || key === 'selected') continue;
    if (Array.isArray(value)) {
      value.forEach((item) => {
        nextSearch.append(key, item);
      });
    } else {
      nextSearch.set(key, value);
    }
  }
  nextSearch.set('selected', id);
  redirect(`/backoffice/audit-logs?${nextSearch.toString()}`);
}
