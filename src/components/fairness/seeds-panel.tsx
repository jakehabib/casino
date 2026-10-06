'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Copy, KeyRound, RefreshCw, ShieldCheck } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { formatShortDateTime } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { toast } from '@/components/ui/toast';
import { useCopy } from '@/components/wallet/page-frame';
import { useMe } from '@/hooks/use-me';
import type { getSeedState, rotateSeed } from '@/server/services/fairness/seed-service';
import { verifyHref } from './verify-link';

type SeedState = Awaited<ReturnType<typeof getSeedState>>;
type RotateResult = Awaited<ReturnType<typeof rotateSeed>>;

const CLIENT_SEED_RE = /^[\x20-\x7E]{1,64}$/;

function randomClientSeed() {
  const b = new Uint8Array(8);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
}

function Mono({ value, label, testId }: { value: string; label: string; testId?: string }) {
  const copy = useCopy();
  return (
    <div className="flex min-w-0 items-center gap-1 rounded-lg border border-line bg-bg-raised px-3 py-2">
      <code className="min-w-0 flex-1 truncate font-mono text-xs text-fg-muted" title={value} data-testid={testId}>
        {value}
      </code>
      <button type="button" onClick={() => void copy(value, `${label} copied`)} aria-label={`Copy ${label}`} className="shrink-0 rounded p-1 text-fg-subtle transition-colors hover:bg-surface-3 hover:text-fg">
        <Copy size={13} />
      </button>
    </div>
  );
}

export function SeedsPanel() {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['fairness-seeds'], queryFn: () => api.get<SeedState>('/api/fairness/seeds'), enabled: !!me });
  const [clientSeed, setClientSeed] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [lastReveal, setLastReveal] = useState<RotateResult['revealed'] | null>(null);
  useEffect(() => {
    if (q.data) setClientSeed(q.data.active.clientSeed);
  }, [q.data?.active.seedHash]); // eslint-disable-line react-hooks/exhaustive-deps

  const rotate = useMutation({
    mutationFn: (seed: string) => api.post<RotateResult>('/api/fairness/rotate', { clientSeed: seed }),
    onSuccess: (r) => {
      setLastReveal(r.revealed);
      setConfirm(false);
      toast.success('Seed rotated', 'Your previous server seed is now revealed.');
      void qc.invalidateQueries({ queryKey: ['fairness-seeds'] });
      void qc.invalidateQueries({ queryKey: ['round-detail'] });
    },
    onError: (e) => {
      setConfirm(false);
      toast.error(e instanceof ApiError ? e.title : 'Could not rotate', e instanceof ApiError && e.code === 'ROUND_IN_PROGRESS' ? 'Finish your blackjack hand first, then rotate.' : e.message);
    },
  });

  if (!me) {
    return (
      <div className="rounded-xl border border-line bg-surface-1 px-5 py-6 text-[13px] text-fg-muted">
        <Link href="/login?next=/fairness" className="font-medium text-fg hover:underline">
          Sign in
        </Link>{' '}
        to see your seed pair and rotate it. The verifier below works for anyone.
      </div>
    );
  }
  if (q.isLoading) return <Skeleton className="h-64 rounded-xl" />;
  if (q.isError || !q.data) return <ErrorState title="Couldn’t load your seeds" onRetry={() => void q.refetch()} />;

  const s = q.data;
  const seedValid = CLIENT_SEED_RE.test(clientSeed.trim());

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-line bg-surface-1 p-4 sm:p-5" data-testid="active-seeds">
        <div className="flex items-center justify-between gap-3">
          <h3 className="flex items-center gap-2 text-[14px] font-semibold">
            <KeyRound size={15} className="text-fg-subtle" /> Active seed pair
          </h3>
          <span className="tabular rounded-md bg-surface-3 px-2 py-1 text-xs text-fg-muted">
            Next nonce <span className="font-semibold text-fg" data-testid="active-nonce">{s.active.nonce}</span>
          </span>
        </div>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div>
            <div className="mb-1.5 text-xs font-medium text-fg-subtle">Server seed hash (SHA-256 commitment)</div>
            <Mono value={s.active.seedHash} label="Server seed hash" testId="active-hash" />
            <p className="mt-1.5 text-xs text-fg-subtle">The seed itself stays secret until you rotate — so no one, including us, can change it after you play.</p>
          </div>
          <div>
            <label htmlFor="client-seed" className="mb-1.5 block text-xs font-medium text-fg-subtle">
              Client seed (yours to choose)
            </label>
            <Input
              id="client-seed"
              value={clientSeed}
              maxLength={64}
              spellCheck={false}
              autoComplete="off"
              invalid={!seedValid}
              onChange={(e) => setClientSeed(e.target.value)}
              className="h-10 font-mono"
              trailing={
                <button type="button" onClick={() => setClientSeed(randomClientSeed())} className="shrink-0 rounded p-1 text-fg-subtle hover:bg-surface-3 hover:text-fg" aria-label="Randomise client seed" title="Randomise">
                  <RefreshCw size={13} />
                </button>
              }
              data-testid="client-seed"
            />
            <p className="mt-1.5 text-xs text-fg-subtle">{seedValid ? 'A new client seed takes effect when you rotate.' : '1–64 printable characters.'}</p>
          </div>
        </div>
        <div className="mt-4 flex flex-col gap-3 border-t border-line pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-fg-subtle">
            Rotating reveals the current server seed so you can verify every round it produced, and commits a fresh one.
          </p>
          <Button variant="secondary" size="sm" leftIcon={<RefreshCw size={14} />} disabled={!seedValid} onClick={() => setConfirm(true)} data-testid="rotate">
            Rotate seed pair
          </Button>
        </div>
      </section>

      {lastReveal ? (
        <section className="rounded-xl border border-win/25 bg-win-soft p-4 sm:p-5" data-testid="reveal">
          <h3 className="flex items-center gap-2 text-[13px] font-semibold text-fg">
            <ShieldCheck size={15} className="text-win" /> Previous server seed revealed
          </h3>
          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            <div>
              <div className="mb-1 text-[11px] text-fg-subtle">Server seed</div>
              <Mono value={lastReveal.serverSeed} label="Server seed" />
            </div>
            <div>
              <div className="mb-1 text-[11px] text-fg-subtle">Hash it was committed as</div>
              <Mono value={lastReveal.seedHash} label="Seed hash" />
            </div>
          </div>
          <p className="mt-2 text-xs text-fg-muted">
            Used for nonces 0–{Math.max(0, lastReveal.finalNonce - 1)} with client seed <code className="font-mono">{lastReveal.clientSeed}</code>.
          </p>
        </section>
      ) : null}

      <section className="overflow-hidden rounded-xl border border-line bg-surface-1">
        <div className="border-b border-line-soft px-4 py-3 text-[13px] font-semibold sm:px-5">Revealed seed pairs</div>
        {s.previous.length === 0 ? (
          <p className="px-4 py-5 text-[13px] text-fg-subtle sm:px-5">None yet. Rotate your seed pair to reveal the current server seed.</p>
        ) : (
          <ul className="divide-y divide-line-soft">
            {s.previous.map((p) => (
              <li key={p.seedHash} className="grid gap-2 px-4 py-3 sm:px-5 lg:grid-cols-[1fr_1fr_auto] lg:items-center lg:gap-4">
                <div className="min-w-0">
                  <div className="mb-1 text-[11px] text-fg-subtle">Server seed</div>
                  <Mono value={p.serverSeed} label="Server seed" />
                </div>
                <div className="min-w-0">
                  <div className="mb-1 text-[11px] text-fg-subtle">
                    Client seed · {p.finalNonce} {p.finalNonce === 1 ? 'round' : 'rounds'} · revealed {p.revealedAt ? formatShortDateTime(p.revealedAt) : ''}
                  </div>
                  <Mono value={p.clientSeed} label="Client seed" />
                </div>
                <Link
                  href={verifyHref({ game: 'roulette', serverSeed: p.serverSeed, clientSeed: p.clientSeed, nonce: '0', seedHash: p.seedHash })}
                  className="lg:self-end"
                >
                  <Button variant="subtle" size="sm" block leftIcon={<ShieldCheck size={13} />}>
                    Verify
                  </Button>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Modal
        open={confirm}
        onOpenChange={setConfirm}
        title="Rotate your seed pair?"
        description="This reveals your current server seed and starts a new one."
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirm(false)}>
              Cancel
            </Button>
            <Button loading={rotate.isPending} onClick={() => rotate.mutate(clientSeed.trim())} data-testid="rotate-confirm">
              Rotate now
            </Button>
          </>
        }
      >
        <ul className="space-y-3 text-[13px] leading-relaxed text-fg-muted">
          <li className="flex gap-2.5">
            <ShieldCheck size={15} className="mt-0.5 shrink-0 text-fg-subtle" />
            Your current server seed is revealed so you can verify every round it produced.
          </li>
          <li className="flex gap-2.5">
            <AlertTriangle size={15} className="mt-0.5 shrink-0 text-warn" />
            Your Blackjack and Baccarat shoes are retired — their remaining order would otherwise be knowable. A fresh shoe is shuffled on your next deal.
          </li>
          <li className="flex gap-2.5">
            <AlertTriangle size={15} className="mt-0.5 shrink-0 text-warn" />
            An unfinished Blackjack hand blocks rotation. Finish it first.
          </li>
          <li className="flex gap-2.5">
            <KeyRound size={15} className="mt-0.5 shrink-0 text-fg-subtle" />
            <span>
              New client seed: <code className="break-all font-mono text-fg">{clientSeed.trim()}</code>
            </span>
          </li>
        </ul>
      </Modal>
    </div>
  );
}
