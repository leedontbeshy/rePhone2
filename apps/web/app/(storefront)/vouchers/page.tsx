import type { Metadata } from 'next';
import { VoucherDiscovery } from '@/components/storefront/voucher-discovery';
import { listPublicVouchers } from '@/lib/public-voucher-api';

export const metadata: Metadata = {
  title: 'Ưu đãi hiện hành | rePhone',
  description: 'Khám phá mã ưu đãi công khai và ưu đãi dành cho tài khoản rePhone.',
};

interface VouchersPageProps {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function VouchersPage({ searchParams }: VouchersPageProps) {
  const current = await searchParams;
  const rawPage = Array.isArray(current['page']) ? current['page'][0] : current['page'];
  const page = rawPage !== undefined && /^\d+$/.test(rawPage) ? Math.max(1, Number(rawPage)) : 1;

  try {
    const initialResponse = await listPublicVouchers({ page, pageSize: 12 });
    return <VoucherDiscovery initialResponse={initialResponse} page={page} />;
  } catch {
    return <VoucherDiscovery initialResponse={null} page={page} />;
  }
}
