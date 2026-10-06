'use client';
import Link from 'next/link';
import { Copy, ShieldCheck, EyeOff } from 'lucide-react';
import type { RoundDetail } from '@/lib/round-detail';
import { Button } from '@/components/ui/button';
import { useCopy } from '@/components/wallet/page-frame';
import { verifyHref, verifyParamsFor } from '@/components/fairness/verify-link';

function Field({ label, value, mono = true, copy }: { label: string; value: React.ReactNode; mono?: boolean; copy?: string }) {
  const doCopy = useCopy();
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-medium text-fg-subtle">{label}</dt>
      <dd className="mt-0.5 flex min-w-0 items-center gap-1.5">
        <span className={mono ? 'min-w-0 truncate font-mono text-xs text-fg-muted' : 'text-[13px] text-fg-muted'} title={typeof value === 'string' ? value : undefined}>
          {value}
        </span>
        {copy ? (
          <button type="button" onClick={() => void doCopy(copy, `${label} copied`)} className="shrink-0 rounded p-1 text-fg-faint transition-colors hover:bg-surface-3 hover:text-fg" aria-label={`Copy ${label}`}>
            <Copy size={12} />
          </button>
        ) : null}
      </dd>
    </div>
  );
}

export function FairnessBlock({ detail }: { detail: RoundDetail<unknown> }) {
  const f = detail.fairness;
  if (!f) return null;
  const params = verifyParamsFor(detail);
  const isCrash = detail.game === 'CRASH';
  return (
    <section className="rounded-xl border border-line bg-bg-raised/60 p-4" data-testid="fairness-block">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-1.5 text-[13px] font-semibold text-fg">
          <ShieldCheck size={15} className="text-fg-subtle" /> Provably fair
        </h3>
        {detail.forced ? <span className="rounded bg-warn/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-warn">Dev forced result</span> : null}
      </div>
      <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
        <Field label={isCrash ? 'Round seed hash' : 'Server seed hash'} value={f.serverSeedHash} copy={f.serverSeedHash} />
        {isCrash ? (
          <Field label="Salt" value={String((f.extra as Record<string, unknown> | undefined)?.salt ?? f.clientSeed)} copy={String((f.extra as Record<string, unknown> | undefined)?.salt ?? f.clientSeed)} />
        ) : (
          <Field label="Client seed" value={f.clientSeed} copy={f.clientSeed} />
        )}
        <Field label={isCrash ? 'Round' : 'Nonce'} value={String(f.nonce)} mono />
        {f.serverSeed ? (
          <Field label={isCrash ? 'Round seed' : 'Server seed (revealed)'} value={f.serverSeed} copy={f.serverSeed} />
        ) : (
          <div>
            <dt className="text-[11px] font-medium text-fg-subtle">{isCrash ? 'Round seed' : 'Server seed'}</dt>
            <dd className="mt-0.5 flex items-center gap-1.5 text-xs text-fg-muted">
              <EyeOff size={12} className="shrink-0 text-fg-subtle" />
              {isCrash ? (
                'Revealed when the round ends'
              ) : (
                <span>
                  Revealed after you rotate your seed —{' '}
                  <Link href="/fairness#seeds" className="font-medium text-fg underline-offset-2 hover:underline">
                    rotate now
                  </Link>
                </span>
              )}
            </dd>
          </div>
        )}
      </dl>
      <div className="mt-4 flex flex-col gap-2 border-t border-line pt-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-fg-subtle">
          {f.serverSeed ? 'Re-derive this result in your browser with the public algorithm.' : 'You can verify the seed hash now and the full result once the seed is revealed.'}
        </p>
        {params ? (
          <Link href={verifyHref(params)} className="shrink-0">
            <Button size="sm" variant={f.serverSeed ? 'secondary' : 'subtle'} leftIcon={<ShieldCheck size={14} />} data-testid="verify-result">
              Verify result
            </Button>
          </Link>
        ) : null}
      </div>
    </section>
  );
}
