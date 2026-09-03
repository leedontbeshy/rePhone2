'use client';

import { useEffect, useState } from 'react';
import { consumeFragmentToken } from '@/lib/one-time-auth';

export function useFragmentAuthToken() {
  const [token, setToken] = useState<string>();
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const consumeCurrentFragment = () => {
      if (window.location.hash.length === 0) {
        setLoaded(true);
        return;
      }
      const captured = consumeFragmentToken(window.location.hash, () => {
        window.history.replaceState(
          null,
          '',
          `${window.location.pathname}${window.location.search}`,
        );
      });
      setToken(captured);
      setLoaded(true);
    };

    consumeCurrentFragment();
    window.addEventListener('hashchange', consumeCurrentFragment);
    return () => {
      window.removeEventListener('hashchange', consumeCurrentFragment);
    };
  }, []);

  return { loaded, setToken, token };
}
