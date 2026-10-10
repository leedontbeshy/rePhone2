'use client';
import { useEffect, useMemo, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/app/auth-provider';
import { affiliateApi, referralDestination } from '@/lib/affiliate-api';
import { startReferralNavigation } from '@/lib/referral-navigation';
export default function ReferralPage() {
  const { code } = useParams<{ code: string }>();
  const { client } = useAuth();
  const router = useRouter();
  const api = useMemo(() => affiliateApi(client), [client]);
  const capture = useRef<{ key: string; result: Promise<unknown> } | null>(null);
  useEffect(() => {
    const destination = referralDestination(new URLSearchParams(window.location.search).get('to'));
    if (capture.current?.key !== code) {
      capture.current = { key: code, result: api.post('affiliate-program/referrals', { code }) };
    }
    return startReferralNavigation(capture.current.result, () => {
      router.replace(destination);
    });
  }, [api, code, router]);
  return (
    <span className="rp-visually-hidden" role="status">
      Đang mở sản phẩm…
    </span>
  );
}
