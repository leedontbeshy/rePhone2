'use client';

import { useEffect, useRef, useState } from 'react';
import { consumeFragmentToken } from '@/lib/one-time-auth';

export function useFragmentAuthToken() {
  const consumedRef = useRef(false);
  const [token, setToken] = useState<string>();
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (consumedRef.current) return;
    consumedRef.current = true;
    const captured = consumeFragmentToken(window.location.hash, () => {
      window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
    });
    setToken(captured);
    setLoaded(true);
  }, []);

  return { loaded, setToken, token };
}
