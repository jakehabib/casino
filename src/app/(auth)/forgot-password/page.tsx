'use client';
import Link from 'next/link';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/input';
import { api, ApiError } from '@/lib/api';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await api.post('/api/auth/forgot', { email });
      setSent(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };
  return sent ? (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Check your inbox</h1>
      <p className="text-sm text-fg-muted">If an account exists for {email}, we’ve sent a link to reset your password. It expires in one hour.</p>
      <Link href="/login"><Button variant="secondary" block>Back to sign in</Button></Link>
    </div>
  ) : (
    <form onSubmit={submit} className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Reset your password</h1>
        <p className="mt-1 text-sm text-fg-muted">We’ll email you a secure link.</p>
      </div>
      {error ? <div className="rounded-lg border border-loss/30 bg-loss-soft px-3 py-2.5 text-[13px] text-loss">{error}</div> : null}
      <Field label="Email" htmlFor="email">
        <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
      </Field>
      <Button type="submit" block size="lg" loading={loading}>Send reset link</Button>
      <Link href="/login" className="block text-center text-[13px] text-fg-muted hover:text-fg">Back to sign in</Link>
    </form>
  );
}
