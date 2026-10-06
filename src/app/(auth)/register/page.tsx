'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/input';
import { api, ApiError } from '@/lib/api';
import { resetSocket } from '@/lib/socket-client';
import { cn } from '@/lib/cn';

export default function RegisterPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const [form, setForm] = useState({ username: '', email: '', password: '' });
  const [accept, setAccept] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    setFormError(null);
    if (!accept) {
      setFormError('Please confirm you understand Credits have no value.');
      return;
    }
    setLoading(true);
    try {
      await api.post('/api/auth/register', {
        ...form,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        acceptTerms: true,
      });
      resetSocket();
      await qc.invalidateQueries();
      router.push('/');
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError) {
        const field = (err.details?.field as string | undefined) ?? (err.details?.issues as { path: string }[] | undefined)?.[0]?.path;
        if (field && field in form) setErrors({ [field]: err.message });
        else setFormError(err.message);
      } else setFormError('Could not create your account');
      setLoading(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Create your account</h1>
        <p className="mt-1 text-sm text-fg-muted">
          Already playing?{' '}
          <Link href="/login" className="font-medium text-accent hover:text-accent-hover">
            Sign in
          </Link>
        </p>
      </div>
      {formError ? <div role="alert" className="rounded-lg border border-loss/30 bg-loss-soft px-3 py-2.5 text-[13px] text-loss">{formError}</div> : null}
      <Field label="Username" htmlFor="username" error={errors.username} hint="3–20 characters. Letters, numbers, underscores.">
        <Input id="username" autoComplete="username" value={form.username} onChange={set('username')} invalid={!!errors.username} maxLength={20} autoFocus />
      </Field>
      <Field label="Email" htmlFor="email" error={errors.email}>
        <Input id="email" type="email" autoComplete="email" value={form.email} onChange={set('email')} invalid={!!errors.email} />
      </Field>
      <Field label="Password" htmlFor="password" error={errors.password} hint="At least 8 characters.">
        <Input id="password" type="password" autoComplete="new-password" value={form.password} onChange={set('password')} invalid={!!errors.password} />
      </Field>
      <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-line bg-surface-1 p-3">
        <button
          type="button"
          role="checkbox"
          aria-checked={accept}
          onClick={() => setAccept((v) => !v)}
          className={cn('mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] border transition-colors', accept ? 'border-accent bg-accent text-white' : 'border-line-strong bg-bg-raised')}
          data-testid="accept-terms"
        >
          {accept ? <Check size={12} strokeWidth={3} /> : null}
        </button>
        <span className="text-[13px] leading-snug text-fg-muted" onClick={() => setAccept((v) => !v)}>
          I understand NOVA Credits are play money: they can’t be purchased, withdrawn, transferred or exchanged for anything of value. I am 18 or older.
        </span>
      </label>
      <Button type="submit" size="lg" block loading={loading}>
        Create account · 100,000 free Credits
      </Button>
    </form>
  );
}
