'use client';
import { useState } from 'react';
import { checkCredentials, login } from '@/lib/auth';

export default function LoginScreen({ onSuccess }: { onSuccess: () => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (checkCredentials(username, password)) {
      login();
      onSuccess();
    } else {
      setError('Invalid username or password');
    }
  }

  return (
    <div className="flex items-center justify-center h-screen bg-bg">
      <form onSubmit={handleSubmit} className="w-[340px] bg-panel border border-border rounded-xl p-8 flex flex-col gap-5 shadow-2xl">
        <div className="flex flex-col items-center gap-1 mb-2">
          <span className="text-2xl font-bold tracking-widest">
            <span className="text-accent2">PRI</span>SM
          </span>
          <span className="text-[11px] text-muted text-center leading-tight">
            Performance & Real-time Intelligence<br />for Service Management
          </span>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-[11px] text-muted font-semibold uppercase tracking-wider">Username</label>
          <input
            value={username}
            onChange={e => { setUsername(e.target.value); setError(''); }}
            className="bg-card border border-border rounded-md px-3 py-2 text-[13px] text-txt outline-none focus:border-accent2"
            autoFocus
            autoComplete="username"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-[11px] text-muted font-semibold uppercase tracking-wider">Password</label>
          <input
            type="password"
            value={password}
            onChange={e => { setPassword(e.target.value); setError(''); }}
            className="bg-card border border-border rounded-md px-3 py-2 text-[13px] text-txt outline-none focus:border-accent2"
            autoComplete="current-password"
          />
        </div>

        {error && <span className="text-[11px] text-danger">{error}</span>}

        <button
          type="submit"
          className="bg-accent2 text-bg font-semibold text-[13px] rounded-md py-2 hover:brightness-110 transition"
        >
          Sign in
        </button>
      </form>
    </div>
  );
}
