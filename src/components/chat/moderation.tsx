'use client';
import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Flag, Gavel, MessageSquareWarning, ShieldAlert, VolumeX } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Input, Field } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/components/ui/toast';
import { api, ApiError } from '@/lib/api';
import { ReasonCopy, type ReasonCode } from '@/lib/errors';
import { cn } from '@/lib/cn';
import { formatDuration } from '@/lib/format';
import { MUTE_PRESETS, REPORT_REASONS, type ReportReason } from '@/server/services/chat/types';
import { deleteChatMessage, setUserBlocked, setUserMuted } from './chat-store';

export interface ModTarget {
  id: string;
  username: string;
  displayName: string;
}

export type ModDialogSpec =
  | { kind: 'report'; target: ModTarget; messageId: string; preview: string }
  | { kind: 'warn'; target: ModTarget; messageId?: string }
  | { kind: 'mute'; target: ModTarget }
  | { kind: 'ban'; target: ModTarget }
  | { kind: 'suspend'; target: ModTarget };

export function notifyError(err: unknown) {
  const code = (err as { code?: string })?.code as ReasonCode | undefined;
  const title = err instanceof ApiError ? err.title : code ? (ReasonCopy[code]?.title ?? 'Action failed') : 'Action failed';
  const message = (err as Error)?.message ?? ReasonCopy.INTERNAL.message;
  toast.error(title, code === 'INTERNAL' ? ReasonCopy.INTERNAL.message : message);
}

/** Moderation + personal-safety actions with consistent toasts and cache refresh. */
export function useChatActions() {
  const qc = useQueryClient();
  const refresh = (username?: string) => {
    if (username) void qc.invalidateQueries({ queryKey: ['profile', username.toLowerCase()] });
    void qc.invalidateQueries({ queryKey: ['mod-reports'] });
  };
  const run = async (fn: () => Promise<unknown>, ok: string, username?: string) => {
    try {
      await fn();
      toast.success(ok);
      refresh(username);
      return true;
    } catch (e) {
      notifyError(e);
      return false;
    }
  };
  return {
    deleteMessage: (id: string) => run(() => deleteChatMessage(id), 'Message removed'),
    muteFor: (t: ModTarget, seconds: number) =>
      run(() => api.post('/api/chat/moderation/mute', { userId: t.id, durationSec: seconds }), `Muted @${t.username} for ${formatDuration(seconds * 1000)}`, t.username),
    unmute: (t: ModTarget) => run(() => api.post('/api/chat/moderation/unmute', { userId: t.id }), `Unmuted @${t.username}`, t.username),
    unban: (t: ModTarget) => run(() => api.post('/api/chat/moderation/unban', { userId: t.id }), `Lifted chat ban for @${t.username}`, t.username),
    block: (t: ModTarget, blocked: boolean) =>
      run(() => setUserBlocked(t.id, blocked), blocked ? `Blocked @${t.username} — you won’t see their messages` : `Unblocked @${t.username}`, t.username),
    hide: (t: ModTarget, hidden: boolean) => {
      setUserMuted(t.id, hidden);
      toast.info(hidden ? `Muted @${t.username} for this session` : `Unmuted @${t.username}`, hidden ? 'Their messages are hidden until you close this tab.' : undefined);
    },
  };
}

// ── Dialog ───────────────────────────────────────────────

const CUSTOM_UNITS = [
  { value: 60, label: 'minutes' },
  { value: 3600, label: 'hours' },
  { value: 86_400, label: 'days' },
];

const SUSPEND_PRESETS: { label: string; seconds: number | null }[] = [
  { label: '24 hours', seconds: 86_400 },
  { label: '3 days', seconds: 3 * 86_400 },
  { label: '7 days', seconds: 7 * 86_400 },
  { label: '30 days', seconds: 30 * 86_400 },
  { label: 'Indefinite', seconds: null },
];

function Choice({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'h-9 rounded-lg border px-3 text-[13px] font-medium transition-colors',
        active ? 'border-accent/70 bg-accent-soft text-fg' : 'border-line bg-surface-2 text-fg-muted hover:border-line-strong hover:text-fg',
      )}
    >
      {children}
    </button>
  );
}

const TITLES = {
  report: { icon: Flag, title: 'Report message' },
  warn: { icon: MessageSquareWarning, title: 'Warn player' },
  mute: { icon: VolumeX, title: 'Mute in chat' },
  ban: { icon: Gavel, title: 'Ban from chat' },
  suspend: { icon: ShieldAlert, title: 'Suspend account' },
} as const;

export function ModerationDialog({ spec, onClose }: { spec: ModDialogSpec | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [reason, setReason] = useState('');
  const [reportReason, setReportReason] = useState<ReportReason>('SPAM');
  const [amount, setAmount] = useState('30');
  const [unit, setUnit] = useState(60);
  const [purge, setPurge] = useState(false);
  const [suspendFor, setSuspendFor] = useState<number | null>(86_400);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!spec) return;
    setReason('');
    setReportReason('SPAM');
    setAmount('30');
    setUnit(60);
    setPurge(false);
    setSuspendFor(86_400);
    setError(null);
  }, [spec]);

  const open = !!spec;
  const kind = spec?.kind ?? 'warn';
  const t = spec?.target;
  const Meta = TITLES[kind];
  const muteSeconds = Math.round(Number(amount) * unit);
  const muteValid = Number.isFinite(muteSeconds) && muteSeconds >= 60 && muteSeconds <= 30 * 86_400;
  const needsReason = kind === 'warn' || kind === 'suspend';
  const valid = (!needsReason || reason.trim().length >= 3) && (kind !== 'mute' || muteValid);

  const submit = async () => {
    if (!spec || !valid) return;
    setBusy(true);
    setError(null);
    try {
      let ok = '';
      switch (spec.kind) {
        case 'report': {
          const r = await api.post<{ duplicate: boolean }>('/api/chat/reports', { messageId: spec.messageId, reason: reportReason, details: reason || null });
          ok = r.duplicate ? 'You already reported this message' : 'Thanks — a moderator will review it';
          break;
        }
        case 'warn':
          await api.post('/api/chat/moderation/warn', { userId: spec.target.id, reason, messageId: spec.messageId ?? null });
          ok = `Warning sent to @${spec.target.username}`;
          break;
        case 'mute':
          await api.post('/api/chat/moderation/mute', { userId: spec.target.id, durationSec: muteSeconds, reason: reason || null, purge });
          ok = `Muted @${spec.target.username} for ${formatDuration(muteSeconds * 1000)}`;
          break;
        case 'ban':
          await api.post('/api/chat/moderation/ban', { userId: spec.target.id, reason: reason || null, purge });
          ok = `@${spec.target.username} is banned from chat`;
          break;
        case 'suspend':
          await api.post('/api/chat/moderation/suspend', { userId: spec.target.id, durationSec: suspendFor, reason });
          ok = `@${spec.target.username}’s account is suspended`;
          break;
      }
      toast.success(ok);
      void qc.invalidateQueries({ queryKey: ['profile', spec.target.username.toLowerCase()] });
      void qc.invalidateQueries({ queryKey: ['mod-reports'] });
      onClose();
    } catch (e) {
      setError((e as Error).message ?? 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  const cta = { report: 'Submit report', warn: 'Send warning', mute: 'Mute', ban: 'Ban from chat', suspend: 'Suspend account' }[kind];

  return (
    <Modal
      open={open}
      onOpenChange={(o) => !o && onClose()}
      size="sm"
      tone={kind === 'suspend' || kind === 'ban' ? 'serious' : 'default'}
      title={
        <span className="flex items-center gap-2">
          <Meta.icon size={17} className={kind === 'suspend' || kind === 'ban' ? 'text-loss' : 'text-fg-muted'} />
          {Meta.title}
        </span>
      }
      description={t ? <span>@{t.username}</span> : null}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant={kind === 'suspend' || kind === 'ban' ? 'danger' : 'primary'} loading={busy} disabled={!valid} onClick={submit} data-testid="mod-dialog-submit">
            {cta}
          </Button>
        </>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        {spec?.kind === 'report' ? (
          <>
            <blockquote className="rounded-lg border border-line bg-surface-2 px-3 py-2 text-[13px] text-fg-muted [overflow-wrap:anywhere]">{spec.preview}</blockquote>
            <div role="radiogroup" aria-label="Reason" className="grid gap-1.5">
              {REPORT_REASONS.map((r) => (
                <label
                  key={r.value}
                  className={cn(
                    'flex h-10 cursor-pointer items-center gap-3 rounded-lg border px-3 text-[13px] font-medium transition-colors',
                    reportReason === r.value ? 'border-accent/70 bg-accent-soft text-fg' : 'border-line bg-surface-2 text-fg-muted hover:border-line-strong',
                  )}
                >
                  <input type="radio" name="report-reason" className="sr-only" checked={reportReason === r.value} onChange={() => setReportReason(r.value)} />
                  <span className={cn('h-3.5 w-3.5 rounded-full border-2', reportReason === r.value ? 'border-accent bg-accent shadow-[inset_0_0_0_2px_var(--color-surface-1)]' : 'border-line-strong')} />
                  {r.label}
                </label>
              ))}
            </div>
          </>
        ) : null}

        {kind === 'mute' ? (
          <div className="space-y-2">
            <div className="text-[13px] font-medium text-fg-muted">Duration</div>
            <div className="flex flex-wrap gap-1.5">
              {MUTE_PRESETS.map((p) => (
                <Choice
                  key={p.seconds}
                  active={muteSeconds === p.seconds}
                  onClick={() => {
                    const u = p.seconds % 86_400 === 0 ? 86_400 : p.seconds % 3600 === 0 ? 3600 : 60;
                    setUnit(u);
                    setAmount(String(p.seconds / u));
                  }}
                >
                  {p.short}
                </Choice>
              ))}
            </div>
            <div className="flex gap-2">
              <Input inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, '').slice(0, 5))} aria-label="Duration amount" className="w-24" invalid={!muteValid} />
              <div className="flex gap-1.5">
                {CUSTOM_UNITS.map((u) => (
                  <Choice key={u.value} active={unit === u.value} onClick={() => setUnit(u.value)}>
                    {u.label}
                  </Choice>
                ))}
              </div>
            </div>
            {!muteValid ? <p className="text-xs text-loss">Between 1 minute and 30 days.</p> : null}
          </div>
        ) : null}

        {kind === 'suspend' ? (
          <div className="space-y-2">
            <div className="text-[13px] font-medium text-fg-muted">Suspend for</div>
            <div className="flex flex-wrap gap-1.5">
              {SUSPEND_PRESETS.map((p) => (
                <Choice key={p.label} active={suspendFor === p.seconds} onClick={() => setSuspendFor(p.seconds)}>
                  {p.label}
                </Choice>
              ))}
            </div>
            <p className="text-xs leading-relaxed text-fg-subtle">The player can sign in and view their history but cannot play or chat. This is recorded in the admin audit log.</p>
          </div>
        ) : null}

        <Field label={kind === 'report' ? 'Details (optional)' : needsReason ? 'Reason' : 'Reason (optional)'} htmlFor="mod-reason">
          <Input
            id="mod-reason"
            value={reason}
            maxLength={kind === 'report' ? 200 : 300}
            onChange={(e) => setReason(e.target.value)}
            placeholder={kind === 'report' ? 'Anything a moderator should know' : kind === 'warn' ? 'e.g. Please keep it friendly' : 'Visible to the player'}
            autoFocus={kind !== 'report'}
          />
        </Field>

        {kind === 'mute' || kind === 'ban' ? (
          <label className="flex items-center justify-between gap-4 rounded-lg border border-line bg-surface-2 px-3 py-2.5">
            <span>
              <span className="block text-[13px] font-medium text-fg">Remove recent messages</span>
              <span className="block text-xs text-fg-subtle">Deletes their messages from the last 24 hours</span>
            </span>
            <Switch checked={purge} onCheckedChange={setPurge} label="Remove recent messages" />
          </label>
        ) : null}

        {error ? <p className="text-[13px] font-medium text-loss">{error}</p> : null}
      </form>
    </Modal>
  );
}
