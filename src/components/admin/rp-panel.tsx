'use client';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { HeartHandshake, ShieldCheck, Clock } from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatDateTime, formatDuration } from '@/lib/format';
import { toast } from '@/components/ui/toast';
import { Button } from '@/components/ui/button';
import type { AdminRpView, serializeAdminExclusion } from '@/server/services/admin/responsible-play';
import { Credits, Panel, Pill, ReasonDialog, RestrictedNote, Time } from './ui';

export type AdminExclusion = ReturnType<typeof serializeAdminExclusion>;

export function ExclusionStatus({ e }: { e: AdminExclusion }) {
  if (e.status === 'REINSTATEMENT_REQUESTED') return <Pill tone="info" dot>Review requested</Pill>;
  if (e.status === 'REINSTATED') return <Pill tone="neutral">Reinstated</Pill>;
  if (e.active) return <Pill tone={e.kind === 'COOLDOWN' ? 'warn' : 'loss'} dot>Active</Pill>;
  return <Pill tone="neutral">Ended</Pill>;
}

/** The single explanation of what (if anything) staff can do about a restriction. */
export function OverrideNote({ e, canReinstate, onReinstate }: { e: AdminExclusion; canReinstate: boolean; onReinstate?: () => void }) {
  if (!e.active) return null;
  if (!e.overridable) {
    return (
      <RestrictedNote>
        <span className="font-semibold text-fg">Restricted: cannot be overridden.</span> Time-limited breaks and self-exclusions run their full course. No staff member can end or shorten them.
      </RestrictedNote>
    );
  }
  if (e.status !== 'REINSTATEMENT_REQUESTED') {
    return (
      <RestrictedNote>
        <span className="font-semibold text-fg">Restricted: cannot be overridden.</span> An indefinite exclusion can only be reviewed after the player requests reinstatement and the waiting period passes.
      </RestrictedNote>
    );
  }
  const eligibleAt = e.reinstatementEligibleAt ? new Date(e.reinstatementEligibleAt) : null;
  const waiting = eligibleAt && eligibleAt > new Date();
  return (
    <div className="space-y-2">
      <div className="flex items-start gap-2.5 rounded-lg border border-info/25 bg-info/5 px-3 py-2.5 text-xs text-fg-muted">
        <Clock size={14} className="mt-px shrink-0 text-info" />
        <div>
          Player requested review {e.reinstatementRequestedAt ? formatDateTime(e.reinstatementRequestedAt) : ''}.{' '}
          {waiting && eligibleAt ? (
            <>
              Waiting period ends <span className="font-medium text-fg">{formatDateTime(eligibleAt)}</span> ({formatDuration(eligibleAt.getTime() - Date.now())} left).
            </>
          ) : (
            <>Waiting period complete.</>
          )}
        </div>
      </div>
      {canReinstate ? (
        e.reinstatable && onReinstate ? (
          <Button size="sm" variant="secondary" leftIcon={<ShieldCheck size={14} />} onClick={onReinstate}>
            Process reinstatement
          </Button>
        ) : null
      ) : (
        <RestrictedNote>Only a Super Admin can process a reinstatement.</RestrictedNote>
      )}
    </div>
  );
}

export function ReinstateDialog({ exclusion, onOpenChange, username, invalidate }: { exclusion: AdminExclusion | null; onOpenChange: (o: boolean) => void; username?: string; invalidate: unknown[][] }) {
  const qc = useQueryClient();
  return (
    <ReasonDialog
      open={!!exclusion}
      onOpenChange={onOpenChange}
      title="Process reinstatement"
      description={`End the indefinite self-exclusion${username ? ` for @${username}` : ''}. Only do this after completing the review conversation with the player.`}
      confirmLabel="Approve reinstatement"
      placeholder="Summarise the review (e.g. call date, outcome). Recorded in the audit log."
      summary={
        exclusion ? (
          <div className="space-y-1.5 text-fg-muted">
            <div className="flex justify-between">
              <span>Exclusion</span>
              <span className="text-fg">{exclusion.label}</span>
            </div>
            <div className="flex justify-between">
              <span>Started</span>
              <span className="text-fg">{formatDateTime(exclusion.startsAt)}</span>
            </div>
            <div className="flex justify-between">
              <span>Review requested</span>
              <span className="text-fg">{exclusion.reinstatementRequestedAt ? formatDateTime(exclusion.reinstatementRequestedAt) : '—'}</span>
            </div>
          </div>
        ) : null
      }
      onConfirm={async (reason) => {
        await api.post('/api/admin/responsible-play/reinstate', { exclusionId: exclusion!.id, reason });
        toast.success('Reinstatement processed', 'The player has been notified.');
        await Promise.all(invalidate.map((k) => qc.invalidateQueries({ queryKey: k })));
      }}
    />
  );
}

function LimitRow({ label, limit, used }: { label: string; limit: number | null; used: number }) {
  const p = limit ? Math.min(100, (used / limit) * 100) : 0;
  return (
    <div>
      <div className="flex items-baseline justify-between text-[13px]">
        <span className="text-fg-muted">{label}</span>
        {limit === null ? (
          <span className="text-fg-subtle">No limit</span>
        ) : (
          <span className="tabular text-fg">
            {used.toLocaleString('en-US')} <span className="text-fg-subtle">/ {limit.toLocaleString('en-US')}</span>
          </span>
        )}
      </div>
      {limit !== null ? (
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-3">
          <div className={cn('h-full rounded-full', p >= 100 ? 'bg-loss' : p >= 80 ? 'bg-warn' : 'bg-fg-subtle')} style={{ width: `${p}%` }} />
        </div>
      ) : null}
    </div>
  );
}

export function ResponsiblePlayPanel({ rp, userId, username, canReinstate }: { rp: AdminRpView; userId: string; username: string; canReinstate: boolean }) {
  const [target, setTarget] = useState<AdminExclusion | null>(null);
  const a = rp.activeExclusion;
  return (
    <Panel
      title={
        <span className="flex items-center gap-2">
          <HeartHandshake size={14} className="text-fg-subtle" /> Responsible play
        </span>
      }
      description={`Read-only · player timezone ${rp.timezone}`}
    >
      <div className="space-y-4">
        {a ? (
          <div className={cn('rounded-lg border p-3', a.kind === 'COOLDOWN' ? 'border-warn/25 bg-warn/5' : 'border-loss/25 bg-loss-soft')}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-[13.5px] font-semibold text-fg">{a.label}</div>
                <div className="mt-0.5 text-xs text-fg-muted">
                  Activated {formatDateTime(a.startsAt)}
                  <br />
                  {a.endsAt ? <>Expires {formatDateTime(a.endsAt)}</> : <>No end date</>}
                </div>
              </div>
              <ExclusionStatus e={a} />
            </div>
            <div className="mt-3">
              <OverrideNote e={a} canReinstate={canReinstate} onReinstate={() => setTarget(a)} />
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2 rounded-lg border border-line bg-surface-2 px-3 py-2.5 text-[13px] text-fg-muted">
            <ShieldCheck size={14} className="text-win" /> No active break or self-exclusion.
          </div>
        )}

        <div className="space-y-3">
          <LimitRow label="Daily wager limit" limit={rp.limits.dailyWager} used={rp.today.wagered} />
          <LimitRow label="Daily loss limit" limit={rp.limits.dailyLoss} used={rp.today.lost} />
        </div>

        {rp.pendingChanges.length ? (
          <div>
            <div className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.08em] text-fg-subtle">Pending changes</div>
            <ul className="space-y-1.5">
              {rp.pendingChanges.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-2 rounded-md bg-surface-2 px-2.5 py-2 text-xs">
                  <span className="text-fg-muted">
                    {c.limitType === 'DAILY_WAGER' ? 'Wager' : 'Loss'} limit → <span className="font-medium text-fg">{c.newValue === null ? 'removed' : c.newValue.toLocaleString('en-US')}</span>
                  </span>
                  <span className="text-fg-subtle">
                    effective <Time at={c.effectiveAt} />
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div>
          <div className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.08em] text-fg-subtle">Today</div>
          <div className="grid grid-cols-3 gap-2 text-xs">
            <div className="rounded-md bg-surface-2 px-2.5 py-2">
              <div className="text-fg-subtle">Wagered</div>
              <Credits value={rp.today.wagered} icon={false} className="mt-0.5" />
            </div>
            <div className="rounded-md bg-surface-2 px-2.5 py-2">
              <div className="text-fg-subtle">Won</div>
              <Credits value={rp.today.won} icon={false} className="mt-0.5" />
            </div>
            <div className="rounded-md bg-surface-2 px-2.5 py-2">
              <div className="text-fg-subtle">Net</div>
              <Credits value={rp.today.net} icon={false} signed className="mt-0.5" />
            </div>
          </div>
        </div>

        {rp.exclusions.length ? (
          <div>
            <div className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.08em] text-fg-subtle">History</div>
            <ul className="divide-y divide-line-soft rounded-lg border border-line-soft">
              {rp.exclusions.map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-3 px-3 py-2 text-xs">
                  <div className="min-w-0">
                    <div className="truncate font-medium text-fg">{e.label}</div>
                    <div className="truncate text-fg-subtle">
                      {formatDateTime(e.startsAt)} → {e.endsAt ? formatDateTime(e.endsAt) : e.reinstatedAt ? `reinstated ${formatDateTime(e.reinstatedAt)}` : 'indefinite'}
                    </div>
                  </div>
                  <ExclusionStatus e={e} />
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
      <ReinstateDialog exclusion={target} onOpenChange={(o) => !o && setTarget(null)} username={username} invalidate={[['admin', 'user', userId], ['admin', 'rp']]} />
    </Panel>
  );
}
