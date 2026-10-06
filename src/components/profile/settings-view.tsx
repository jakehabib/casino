'use client';
import Link from 'next/link';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AtSign, Ban, Check, ChevronRight, EyeOff, Globe2, HeartHandshake, History, KeyRound, Lock, Play, ShieldCheck, UserRound, Volume2, Wallet } from 'lucide-react';
import { AvatarPresetPreview, AVATAR_PRESET_COUNT, Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Skeleton } from '@/components/ui/skeleton';
import { LevelBadge } from '@/components/ui/level-badge';
import { toast } from '@/components/ui/toast';
import { api, ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { useAudioPrefs } from '@/audio/use-audio';
import { playSound } from '@/audio/audio-manager';
import { applyPrivacy, derivedHiddenFields, type HiddenField, type Privacy, type PrivacyFlags } from '@/server/services/profile/privacy';
import { useChatActions } from '@/components/chat/moderation';
import { PlayerCardView } from './player-card';
import { useOwnProfile, type PublicProfile } from './use-profile';

interface ProfileSettings {
  username: string;
  displayName: string;
  avatarUrl: string | null;
  privacy: Privacy;
  hideNetResult: boolean;
  hideTotalWagered: boolean;
  hideTotalWon: boolean;
  hideLargestWin: boolean;
  email: string;
}

const SECTIONS = [
  { id: 'profile', label: 'Profile', icon: UserRound },
  { id: 'privacy', label: 'Privacy', icon: ShieldCheck },
  { id: 'sound', label: 'Sound', icon: Volume2 },
  { id: 'security', label: 'Security', icon: KeyRound },
  { id: 'more', label: 'More', icon: ChevronRight },
] as const;

function Card({ id, title, sub, children, footer }: { id: string; title: string; sub?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24 overflow-hidden rounded-2xl border border-line bg-surface-1" data-testid={`settings-${id}`}>
      <div className="border-b border-line px-5 py-4 sm:px-6">
        <h2 className="text-[15px] font-semibold tracking-tight text-fg">{title}</h2>
        {sub ? <p className="mt-0.5 text-[13px] text-fg-subtle">{sub}</p> : null}
      </div>
      <div className="px-5 py-5 sm:px-6">{children}</div>
      {footer ? <div className="flex items-center justify-end gap-2 border-t border-line bg-surface-2/40 px-5 py-3 sm:px-6">{footer}</div> : null}
    </section>
  );
}

function useSaveProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<ProfileSettings>) => api.patch('/api/me/profile', body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['me-profile'] });
      void qc.invalidateQueries({ queryKey: ['me'] });
      void qc.invalidateQueries({ queryKey: ['profile-me'] });
      void qc.invalidateQueries({ queryKey: ['profile'] });
    },
  });
}

// ── Profile ─────────────────────────────────────────────

function ProfileSection({ data }: { data: ProfileSettings }) {
  const [username, setUsername] = useState(data.displayName);
  const [avatar, setAvatar] = useState(data.avatarUrl ?? 'preset:0');
  const [error, setError] = useState<string | null>(null);
  const save = useSaveProfile();
  useEffect(() => {
    setUsername(data.displayName);
    setAvatar(data.avatarUrl ?? 'preset:0');
  }, [data.displayName, data.avatarUrl]);
  const nameChanged = username.trim() !== data.displayName;
  const dirty = nameChanged || avatar !== data.avatarUrl;
  const localError = !/^[A-Za-z0-9_]{3,20}$/.test(username.trim()) ? 'Use 3–20 letters, numbers or underscores.' : null;

  const submit = () => {
    if (!dirty || (nameChanged && localError)) return;
    setError(null);
    save.mutate(
      { ...(nameChanged ? { username: username.trim() } : {}), ...(avatar !== data.avatarUrl ? { avatarUrl: avatar } : {}) },
      {
        onSuccess: () => toast.success('Profile updated'),
        onError: (e) => setError(e instanceof ApiError ? e.message : 'Couldn’t save your profile.'),
      },
    );
  };

  return (
    <Card
      id="profile"
      title="Profile"
      sub="How you appear in chat, on tables and on your public profile."
      footer={
        <>
          {dirty ? (
            <Button variant="ghost" size="sm" onClick={() => { setUsername(data.displayName); setAvatar(data.avatarUrl ?? 'preset:0'); setError(null); }}>
              Discard
            </Button>
          ) : null}
          <Button size="sm" disabled={!dirty || (nameChanged && !!localError)} loading={save.isPending} onClick={submit} data-testid="save-profile">
            Save changes
          </Button>
        </>
      }
    >
      <div className="flex items-center gap-4">
        <Avatar avatarUrl={avatar} name={data.username} size={64} className="ring-1 ring-line-strong" />
        <div className="min-w-0">
          <div className="truncate text-base font-semibold">{username || data.displayName}</div>
          <div className="truncate text-[13px] text-fg-subtle">{data.email}</div>
        </div>
      </div>

      <div className="mt-5">
        <div className="mb-2 text-[13px] font-medium text-fg-muted">Avatar</div>
        <div role="radiogroup" aria-label="Avatar" className="grid grid-cols-6 gap-2 sm:grid-cols-12">
          {Array.from({ length: AVATAR_PRESET_COUNT }, (_, i) => {
            const key = `preset:${i}`;
            const on = avatar === key;
            return (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={on}
                aria-label={`Avatar ${i + 1}`}
                onClick={() => {
                  playSound('toggle');
                  setAvatar(key);
                }}
                className={cn(
                  'relative flex aspect-square items-center justify-center rounded-full transition-[transform,box-shadow] duration-150 hover:scale-[1.06]',
                  on ? 'shadow-[0_0_0_2px_var(--color-bg),0_0_0_4px_var(--color-accent)]' : 'opacity-80 hover:opacity-100',
                )}
              >
                <span className="h-full w-full overflow-hidden rounded-full [&>span]:!h-full [&>span]:!w-full [&_svg]:h-full [&_svg]:w-full">
                  <AvatarPresetPreview index={i} size={48} />
                </span>
                {on ? (
                  <span className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-accent text-white ring-2 ring-surface-1">
                    <Check size={10} strokeWidth={3} />
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-5 max-w-md">
        <Field
          label="Username"
          htmlFor="username"
          error={error ?? (nameChanged ? localError : null)}
          hint={`Shown as typed · your profile link is /u/${(username.trim() || data.username).toLowerCase()}`}
        >
          <Input
            id="username"
            value={username}
            maxLength={20}
            autoComplete="off"
            leading={<AtSign size={15} />}
            invalid={!!error || (nameChanged && !!localError)}
            onChange={(e) => {
              setUsername(e.target.value);
              setError(null);
            }}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            data-testid="username-input"
          />
        </Field>
      </div>
    </Card>
  );
}

// ── Privacy ─────────────────────────────────────────────

const PRIVACY_OPTIONS: { value: Privacy; title: string; body: string; icon: ReactNode }[] = [
  { value: 'PUBLIC', title: 'Public', body: 'Level, join date, games played, favourite game and selected stats.', icon: <Globe2 size={16} /> },
  { value: 'LIMITED', title: 'Limited', body: 'Level, join date and games played only.', icon: <EyeOff size={16} /> },
  { value: 'PRIVATE', title: 'Private', body: 'Only your name, avatar and level.', icon: <Lock size={16} /> },
];

const HIDE_TOGGLES: { key: keyof Pick<PrivacyFlags, 'hideNetResult' | 'hideTotalWagered' | 'hideTotalWon' | 'hideLargestWin'>; field: HiddenField; label: string }[] = [
  { key: 'hideNetResult', field: 'netResult', label: 'Hide net result' },
  { key: 'hideTotalWagered', field: 'totalWagered', label: 'Hide total wagered' },
  { key: 'hideTotalWon', field: 'totalWon', label: 'Hide total won' },
  { key: 'hideLargestWin', field: 'largestWin', label: 'Hide largest win' },
];

const FIELD_LABEL: Record<HiddenField, string> = { netResult: 'Net result', totalWagered: 'Total wagered', totalWon: 'Total won', largestWin: 'Largest win' };

function PrivacySection({ data }: { data: ProfileSettings }) {
  const own = useOwnProfile();
  const save = useSaveProfile();
  const initial: PrivacyFlags = useMemo(
    () => ({ privacy: data.privacy, hideNetResult: data.hideNetResult, hideTotalWagered: data.hideTotalWagered, hideTotalWon: data.hideTotalWon, hideLargestWin: data.hideLargestWin }),
    [data],
  );
  const [flags, setFlags] = useState<PrivacyFlags>(initial);
  useEffect(() => setFlags(initial), [initial]);
  const dirty = (Object.keys(initial) as (keyof PrivacyFlags)[]).some((k) => initial[k] !== flags[k]);
  const derived = derivedHiddenFields(flags);

  const preview: PublicProfile | null = own.data
    ? {
        user: { id: own.data.user.id, username: own.data.user.username, displayName: data.displayName, avatarUrl: data.avatarUrl, level: own.data.level.level, tier: own.data.level.tier, role: own.data.user.role },
        privacy: flags.privacy,
        stats: applyPrivacy(own.data.publicStats, flags),
        isSelf: false,
        viewer: null,
      }
    : null;

  return (
    <Card
      id="privacy"
      title="Privacy"
      sub="Choose what other players can see on your profile and player card. Responsible-play settings are never shown to anyone."
      footer={
        <>
          {dirty ? (
            <Button variant="ghost" size="sm" onClick={() => setFlags(initial)}>
              Discard
            </Button>
          ) : null}
          <Button
            size="sm"
            disabled={!dirty}
            loading={save.isPending}
            data-testid="save-privacy"
            onClick={() =>
              save.mutate(flags, {
                onSuccess: () => toast.success('Privacy updated'),
                onError: (e) => toast.error('Couldn’t save privacy', (e as Error).message),
              })
            }
          >
            Save privacy
          </Button>
        </>
      }
    >
      <div className="@container">
      <div className="grid gap-6 @3xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0 space-y-5">
          <div role="radiogroup" aria-label="Profile visibility" className="grid gap-2 @lg:grid-cols-3">
            {PRIVACY_OPTIONS.map((o) => {
              const on = flags.privacy === o.value;
              return (
                <button
                  key={o.value}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  data-testid={`privacy-${o.value}`}
                  onClick={() => {
                    playSound('toggle');
                    setFlags((f) => ({ ...f, privacy: o.value }));
                  }}
                  className={cn(
                    'relative flex flex-col items-start rounded-xl border p-3.5 text-left transition-[border,background,box-shadow] duration-150',
                    on ? 'border-accent/70 bg-accent-soft shadow-[0_0_0_1px_#7c5cff55]' : 'border-line bg-surface-2 hover:border-line-strong',
                  )}
                >
                  <span className="flex w-full items-center justify-between">
                    <span className={cn('flex h-8 w-8 items-center justify-center rounded-lg', on ? 'bg-accent text-white' : 'bg-surface-3 text-fg-muted')}>{o.icon}</span>
                    <span className={cn('flex h-4 w-4 items-center justify-center rounded-full border-2', on ? 'border-accent bg-accent' : 'border-line-strong')}>
                      {on ? <span className="h-1.5 w-1.5 rounded-full bg-white" /> : null}
                    </span>
                  </span>
                  <span className="mt-3 text-sm font-semibold text-fg">{o.title}</span>
                  <span className="mt-0.5 text-xs leading-snug text-fg-subtle">{o.body}</span>
                </button>
              );
            })}
          </div>

          <div className={cn('rounded-xl border border-line', flags.privacy !== 'PUBLIC' && 'opacity-60')}>
            {HIDE_TOGGLES.map((t, i) => (
              <label key={t.key} className={cn('flex items-center justify-between gap-4 px-4 py-3', i > 0 && 'border-t border-line-soft')}>
                <span>
                  <span className="block text-[13.5px] font-medium text-fg">{t.label}</span>
                  {derived.includes(t.field) ? <span className="block text-xs text-warn">Also hidden automatically — it could be used to work out a hidden stat.</span> : null}
                </span>
                <Switch checked={flags[t.key]} disabled={flags.privacy !== 'PUBLIC'} onCheckedChange={(v) => setFlags((f) => ({ ...f, [t.key]: v }))} label={t.label} />
              </label>
            ))}
            {flags.privacy !== 'PUBLIC' ? <p className="border-t border-line-soft px-4 py-2.5 text-xs text-fg-subtle">These stats are already hidden on a {flags.privacy.toLowerCase()} profile.</p> : null}
          </div>
        </div>

        <div className="@3xl:sticky @3xl:top-24 @3xl:self-start @3xl:row-span-2">
          <div className="mb-2 flex items-center justify-between text-2xs font-semibold uppercase tracking-[0.12em] text-fg-subtle">
            <span>What other players see</span>
            {dirty ? <span className="normal-case tracking-normal text-warn">Unsaved</span> : null}
          </div>
          <div className="overflow-hidden rounded-xl border border-line bg-surface-1 shadow-2" data-testid="privacy-preview">
            {preview ? <PlayerCardView profile={preview} /> : <Skeleton className="h-[190px]" />}
            {preview && flags.privacy === 'PUBLIC' && preview.stats.hidden.length + (preview.stats.derivedHidden?.length ?? 0) > 0 ? (
              <div className="border-t border-line px-3.5 py-2.5 text-xs text-fg-subtle">
                Hidden on your profile: {[...preview.stats.hidden, ...(preview.stats.derivedHidden ?? [])].map((f) => FIELD_LABEL[f]).join(', ')}
              </div>
            ) : null}
          </div>
        </div>
        <div className="min-w-0 @3xl:col-start-1">
          <BlockedPlayers />
        </div>
      </div>
      </div>
    </Card>
  );
}

interface BlockedItem {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  level: number;
  blockedAt: string;
}

function BlockedPlayers() {
  const q = useQuery({ queryKey: ['chat-blocks'], queryFn: () => api.get<{ items: BlockedItem[] }>('/api/chat/blocks') });
  const actions = useChatActions();
  const qc = useQueryClient();
  const items = q.data?.items ?? [];
  return (
    <div className="rounded-xl border border-line">
      <div className="flex items-center justify-between px-4 py-3">
        <span>
          <span className="block text-[13.5px] font-medium text-fg">Blocked players</span>
          <span className="block text-xs text-fg-subtle">You won’t see their chat messages or mentions.</span>
        </span>
        <span className="tabular rounded-md bg-surface-3 px-2 py-0.5 text-xs font-semibold text-fg-muted">{items.length}</span>
      </div>
      {q.isLoading ? (
        <div className="border-t border-line-soft px-4 py-3">
          <Skeleton className="h-8" />
        </div>
      ) : items.length ? (
        items.map((b) => (
          <div key={b.id} className="flex items-center gap-3 border-t border-line-soft px-4 py-2.5">
            <Avatar avatarUrl={b.avatarUrl} name={b.username} size={28} />
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5 text-[13px] font-medium text-fg">
                <span className="truncate">{b.displayName}</span>
                <LevelBadge level={b.level} size="xs" />
              </span>
            </span>
            <Button
              size="xs"
              variant="subtle"
              onClick={async () => {
                if (await actions.block({ id: b.id, username: b.username, displayName: b.displayName }, false)) void qc.invalidateQueries({ queryKey: ['chat-blocks'] });
              }}
            >
              Unblock
            </Button>
          </div>
        ))
      ) : (
        <div className="flex items-center gap-2 border-t border-line-soft px-4 py-3 text-xs text-fg-subtle">
          <Ban size={13} /> You haven’t blocked anyone.
        </div>
      )}
    </div>
  );
}

// ── Sound ───────────────────────────────────────────────

function SoundSection() {
  const { prefs, setPrefs } = useAudioPrefs();
  const rows: { key: 'master' | 'game' | 'win' | 'ui'; label: string; sub: string; test: Parameters<typeof playSound>[0] }[] = [
    { key: 'master', label: 'Master volume', sub: 'Everything', test: 'chip' },
    { key: 'game', label: 'Game effects', sub: 'Cards, chips, reels, wheel', test: 'cardDeal' },
    { key: 'win', label: 'Wins & celebrations', sub: 'Payouts and bonus moments', test: 'win' },
    { key: 'ui', label: 'Interface', sub: 'Clicks, toggles, chat mentions', test: 'notify' },
  ];
  return (
    <Card id="sound" title="Sound" sub="Saved on this device. Sounds start after your first tap or key press.">
      <label className="flex items-center justify-between gap-4 rounded-xl border border-line bg-surface-2 px-4 py-3">
        <span>
          <span className="block text-[13.5px] font-medium text-fg">Mute all sounds</span>
          <span className="block text-xs text-fg-subtle">Silences every game and interface sound</span>
        </span>
        <Switch checked={prefs.muted} onCheckedChange={(v) => setPrefs({ muted: v })} label="Mute all sounds" />
      </label>
      <div className={cn('mt-4 space-y-4', prefs.muted && 'opacity-50')}>
        {rows.map((r) => (
          <div key={r.key} className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-2 sm:grid-cols-[200px_1fr_48px_auto]">
            <span>
              <span className="block text-[13.5px] font-medium text-fg">{r.label}</span>
              <span className="block text-xs text-fg-subtle">{r.sub}</span>
            </span>
            <span className="tabular text-right text-xs font-medium text-fg-muted sm:order-3">{Math.round(prefs[r.key] * 100)}%</span>
            <div className="col-span-2 sm:order-2 sm:col-span-1">
              <Slider value={Math.round(prefs[r.key] * 100)} onValueChange={(v) => setPrefs({ [r.key]: v / 100 })} label={r.label} disabled={prefs.muted} />
            </div>
            <button
              type="button"
              disabled={prefs.muted}
              onClick={() => playSound(r.test)}
              aria-label={`Test ${r.label.toLowerCase()}`}
              className="hidden h-8 w-8 items-center justify-center rounded-md border border-line text-fg-subtle transition-colors hover:bg-surface-3 hover:text-fg disabled:opacity-40 sm:order-4 sm:flex"
            >
              <Play size={13} />
            </button>
          </div>
        ))}
      </div>
      <div className="mt-5">
        <Button variant="secondary" size="sm" leftIcon={<Volume2 size={15} />} disabled={prefs.muted} onClick={() => playSound('win')} data-testid="test-sound">
          Test sound
        </Button>
      </div>
    </Card>
  );
}

// ── Security ────────────────────────────────────────────

function SecuritySection() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<{ current?: string; next?: string; confirm?: string }>({});
  const m = useMutation({
    mutationFn: () => api.post('/api/me/password', { currentPassword: current, newPassword: next }),
    onSuccess: () => {
      toast.success('Password changed');
      setCurrent('');
      setNext('');
      setConfirm('');
    },
    onError: (e) => {
      const field = e instanceof ApiError ? (e.details?.field as string | undefined) : undefined;
      if (field === 'currentPassword') setErrors({ current: e.message });
      else setErrors({ next: (e as Error).message });
    },
  });
  const submit = () => {
    const errs: typeof errors = {};
    if (!current) errs.current = 'Enter your current password';
    if (next.length < 8) errs.next = 'Use at least 8 characters';
    else if (next === current) errs.next = 'Choose a password you haven’t used here';
    if (confirm !== next) errs.confirm = 'Passwords don’t match';
    setErrors(errs);
    if (!Object.keys(errs).length) m.mutate();
  };
  return (
    <Card
      id="security"
      title="Security"
      sub="Change the password you use to sign in."
      footer={
        <Button size="sm" loading={m.isPending} disabled={!current || !next || !confirm} onClick={submit}>
          Update password
        </Button>
      }
    >
      <form
        className="grid max-w-md gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <Field label="Current password" htmlFor="pw-current" error={errors.current}>
          <Input id="pw-current" type="password" autoComplete="current-password" value={current} invalid={!!errors.current} onChange={(e) => setCurrent(e.target.value)} />
        </Field>
        <Field label="New password" htmlFor="pw-new" error={errors.next} hint="At least 8 characters.">
          <Input id="pw-new" type="password" autoComplete="new-password" value={next} invalid={!!errors.next} onChange={(e) => setNext(e.target.value)} />
        </Field>
        <Field label="Confirm new password" htmlFor="pw-confirm" error={errors.confirm}>
          <Input id="pw-confirm" type="password" autoComplete="new-password" value={confirm} invalid={!!errors.confirm} onChange={(e) => setConfirm(e.target.value)} />
        </Field>
        <button type="submit" className="hidden" />
      </form>
    </Card>
  );
}

// ── More ────────────────────────────────────────────────

function MoreSection() {
  const links = [
    { href: '/responsible-play', icon: <HeartHandshake size={16} />, title: 'Responsible play', sub: 'Daily limits, breaks and self-exclusion' },
    { href: '/wallet', icon: <Wallet size={16} />, title: 'Wallet', sub: 'Balance and transaction history' },
    { href: '/history', icon: <History size={16} />, title: 'Game history', sub: 'Every round, with fairness details' },
    { href: '/profile', icon: <UserRound size={16} />, title: 'Your profile', sub: 'Level, XP and lifetime stats' },
  ];
  return (
    <section id="more" className="scroll-mt-24 overflow-hidden rounded-2xl border border-line bg-surface-1">
      {links.map((l, i) => (
        <Link key={l.href} href={l.href} className={cn('group flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-surface-2 sm:px-6', i > 0 && 'border-t border-line-soft')}>
          <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-surface-2 text-fg-muted">{l.icon}</span>
          <span className="min-w-0 flex-1">
            <span className="block text-[13.5px] font-medium text-fg">{l.title}</span>
            <span className="block truncate text-xs text-fg-subtle">{l.sub}</span>
          </span>
          <ChevronRight size={15} className="text-fg-faint transition-transform group-hover:translate-x-0.5" />
        </Link>
      ))}
    </section>
  );
}

// ── Page ────────────────────────────────────────────────

export function SettingsView() {
  const q = useQuery({ queryKey: ['me-profile'], queryFn: () => api.get<ProfileSettings>('/api/me/profile') });
  const [active, setActive] = useState<string>('profile');

  useEffect(() => {
    const els = SECTIONS.map((s) => document.getElementById(s.id)).filter(Boolean) as HTMLElement[];
    if (!els.length) return;
    const io = new IntersectionObserver(
      (entries) => {
        const top = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (top) setActive(top.target.id);
      },
      { rootMargin: '-80px 0px -55% 0px' },
    );
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, [q.data]);

  // Honour #privacy etc. once content exists.
  useEffect(() => {
    if (!q.data || !window.location.hash) return;
    const el = document.getElementById(window.location.hash.slice(1));
    if (el) requestAnimationFrame(() => el.scrollIntoView({ block: 'start' }));
  }, [q.data]);

  return (
    <div className="grid gap-6 lg:grid-cols-[200px_minmax(0,1fr)]" data-testid="settings">
      <nav aria-label="Settings sections" className="scrollbar-none -mx-4 flex gap-1 overflow-x-auto px-4 lg:sticky lg:top-24 lg:mx-0 lg:flex-col lg:self-start lg:px-0">
        {SECTIONS.map((s) => (
          <a
            key={s.id}
            href={`#${s.id}`}
            onClick={() => setActive(s.id)}
            className={cn(
              'relative flex h-9 shrink-0 items-center gap-2.5 rounded-lg px-3 text-[13.5px] font-medium transition-colors',
              active === s.id ? 'bg-surface-3 text-fg' : 'text-fg-muted hover:bg-surface-2 hover:text-fg',
            )}
          >
            <s.icon size={15} className={active === s.id ? 'text-accent' : 'text-fg-subtle'} />
            {s.label}
          </a>
        ))}
      </nav>
      <div className="min-w-0 space-y-5">
        {q.isLoading ? (
          <>
            <Skeleton className="h-[320px] rounded-2xl" />
            <Skeleton className="h-[420px] rounded-2xl" />
          </>
        ) : q.data ? (
          <>
            <ProfileSection data={q.data} />
            <PrivacySection data={q.data} />
          </>
        ) : null}
        <SoundSection />
        {q.data ? <SecuritySection /> : null}
        <MoreSection />
      </div>
    </div>
  );
}
