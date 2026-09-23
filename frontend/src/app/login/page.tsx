'use client';

import { Suspense, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';

function LoginContent() {
  const { user, loading } = useAuth();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.clear();
      sessionStorage.clear();
    }

    if (loading) return;

    const isForce = searchParams.get('force') === 'true' || searchParams.get('logout') === 'true';

    if (user && !isForce) {
      window.location.href = '/received';
      return;
    }

    const loginAuthBase =
      process.env.NEXT_PUBLIC_LOGIN_AUTH_URL || 'http://localhost:3002';
    const appBase =
      process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const returnUrl = encodeURIComponent(`${appBase}/sso/callback`);

    const forceQuery = isForce ? '&force=true' : '';
    window.location.href = `${loginAuthBase}/?returnUrl=${returnUrl}${forceQuery}`;
  }, [user, loading, searchParams]);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        fontFamily: 'sans-serif',
        gap: '1rem',
      }}
    >
      <p style={{ color: '#64748b', fontSize: '1rem' }}>
        Connecting to Central Login...
      </p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            height: '100vh',
            fontFamily: 'sans-serif',
          }}
        >
          <p style={{ color: '#64748b' }}>Connecting to Central Login...</p>
        </div>
      }
    >
      <LoginContent />
    </Suspense>
  );
}



