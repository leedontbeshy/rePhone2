'use client';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/app/auth-provider';
import { affiliateApi, record } from '@/lib/affiliate-api';
const MembershipContext = createContext({ registered: false, refresh: () => {} });
export function AffiliateMembershipProvider({ children }: { children: ReactNode }) {
  const { client, status, user } = useAuth();
  const pathname = usePathname();
  const owner = status === 'authenticated' && user?.role === 'CUSTOMER' ? user.id : null;
  const [membership, setMembership] = useState<{ owner: string; registered: boolean } | null>(null);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!owner) return;
    let active = true;
    void affiliateApi(client)
      .get('affiliate/profile')
      .then((profile) => {
        if (active) setMembership({ owner, registered: Boolean(record(profile)['id']) });
      })
      .catch(() => {
        if (active) setMembership({ owner, registered: false });
      });
    return () => {
      active = false;
    };
  }, [client, owner, pathname, revision]);
  const value = useMemo(
    () => ({
      registered: owner !== null && membership?.owner === owner && membership.registered,
      refresh: () => {
        setRevision((current) => current + 1);
      },
    }),
    [membership, owner],
  );
  return <MembershipContext.Provider value={value}>{children}</MembershipContext.Provider>;
}
export function useAffiliateMembership() {
  return useContext(MembershipContext);
}
