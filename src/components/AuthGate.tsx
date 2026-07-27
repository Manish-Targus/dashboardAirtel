'use client';
import { useEffect, useState } from 'react';
import LoginScreen from './LoginScreen';
import { isAuthenticated } from '@/lib/auth';

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const [authed, setAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    setAuthed(isAuthenticated());
  }, []);

  if (authed === null) return <div className="h-screen bg-bg" />;
  if (!authed) return <LoginScreen onSuccess={() => setAuthed(true)} />;
  return <>{children}</>;
}
