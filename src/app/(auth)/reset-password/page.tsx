'use client';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/input';
import { api, ApiError } from '@/lib/api';

function ResetForm() {
  const token = useSearchParams().get('token') ?? '';
  const [password, setPassword] = useState('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await api.post('/api/auth/reset', { token, password });
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };
  if (done)
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight">Password updated</h1>
        <p className="text-sm text-fg-muted">You’ve been signed out everywhere. Sign in with your new password.</p>
        <Link href="/login"><Button block>Sign in</Button></Link>
      </div>
    );
  return (
    <form onSubmit={submit} className="space-y-5">
      <h1 className="text-2xl font-semibold tracking-tight">Choose a new password</h1>
      {error ? <div className="rounded-lg border border-loss/30 bg-loss-soft px-3 py-2.5 text-[13px] text-loss">{error}</div> : null}
      <Field label="New password" htmlFor="password" hint="At least 8 characters.">
        <Input id="password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
      </Field>
      <Button type="submit" block size="lg" loading={loading} disabled={!token}>Update password</Button>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetForm />
    </Suspense>
  );
}
