import { CustomerOrderDetail } from '@/components/post-purchase/orders/customer-order-detail';

export default async function OrderDetailPage({
  params,
}: Readonly<{ params: Promise<{ orderNumber: string }> }>) {
  const { orderNumber } = await params;
  return <CustomerOrderDetail orderNumber={decodeURIComponent(orderNumber)} />;
}
