'use client';
import { motion } from 'framer-motion';
import { Hand, Plus, Split, ChevronsUp, ShieldCheck, X, RotateCcw } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Kbd } from '@/components/ui/bet-controls';
import { formatCredits } from '@/lib/format';
import { cn } from '@/lib/cn';
import { DUR, EASE } from '@/lib/motion';
import type { BlackjackAction } from '@/engines/blackjack/types';
import type { RoundView } from './reveal';

const ACTIONS: { action: BlackjackAction; label: string; key: string; icon: ReactNode }[] = [
  { action: 'HIT', label: 'Hit', key: 'H', icon: <Plus size={17} strokeWidth={2.4} /> },
  { action: 'STAND', label: 'Stand', key: 'S', icon: <Hand size={16} strokeWidth={2.2} /> },
  { action: 'DOUBLE', label: 'Double', key: 'D', icon: <ChevronsUp size={17} strokeWidth={2.4} /> },
  { action: 'SPLIT', label: 'Split', key: 'P', icon: <Split size={16} strokeWidth={2.2} className="rotate-90" /> },
];

function Row({ id, children }: { id: string; children: ReactNode }) {
  return (
    <motion.div
      data-row={id}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: DUR.standard, ease: EASE.out }}
      className="flex min-h-12 items-center gap-2"
    >
      {children}
    </motion.div>
  );
}

/**
 * Thumb-zone action bar inside the stage. Only legal actions are shown.
 * When idle it carries Deal / Rebet on small screens (desktop uses the panel).
 */
export function ActionBar({
  view,
  busy,
  pending,
  revealing,
  onAction,
  onDeal,
  onRebetDouble,
  bet,
  canDeal,
  hasPrevious,
}: {
  view: RoundView | null;
  busy: boolean;
  pending: string | null;
  revealing: boolean;
  onAction: (a: BlackjackAction) => void;
  onDeal: () => void;
  onRebetDouble: () => void;
  bet: number;
  canDeal: boolean;
  hasPrevious: boolean;
}) {
  const legal = view?.legal ?? [];
  const insurance = view?.status === 'INSURANCE_OFFERED' && legal.includes('INSURANCE');
  const playing = !!view && !view.settled;
  const deciding = playing && legal.length > 0 && !revealing;

  let content: ReactNode;
  if (insurance && !revealing) {
    const cost = Math.floor((view?.baseBet ?? 0) / 2);
    content = (
      <Row key="insurance" id="insurance">
        <Button variant="secondary" size="lg" className="flex-1" disabled={busy} loading={pending === 'DECLINE_INSURANCE'} onClick={() => onAction('DECLINE_INSURANCE')} leftIcon={<X size={16} />} data-testid="bj-decline-insurance">
          No insurance<Kbd>N</Kbd>
        </Button>
        <Button variant="primary" size="lg" className="flex-1" disabled={busy} loading={pending === 'INSURANCE'} onClick={() => onAction('INSURANCE')} leftIcon={<ShieldCheck size={16} />} data-testid="bj-insurance">
          Insure {formatCredits(cost)}<Kbd>Y</Kbd>
        </Button>
      </Row>
    );
  } else if (deciding) {
    const shown = ACTIONS.filter((a) => legal.includes(a.action));
    content = (
      <Row key="play" id="play">
        {shown.map((a) => {
          const stake = a.action === 'DOUBLE' || a.action === 'SPLIT' ? view!.hands[view!.active]?.bet : 0;
          return (
            <Button
              key={a.action}
              variant={a.action === 'HIT' ? 'primary' : 'secondary'}
              size="lg"
              className={cn('h-12 min-w-0 flex-1 px-2 sm:px-4')}
              disabled={busy}
              loading={pending === a.action}
              onClick={() => onAction(a.action)}
              leftIcon={a.icon}
              data-testid={`bj-${a.action.toLowerCase()}`}
              title={stake ? `${a.label} (+${formatCredits(stake)})` : a.label}
            >
              {a.label}
              <Kbd>{a.key}</Kbd>
            </Button>
          );
        })}
      </Row>
    );
  } else if (playing) {
    content = (
      <Row key="wait" id="wait">
        <div className="flex h-12 flex-1 items-center justify-center gap-2 text-[13px] font-medium text-white/55">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white/60" />
          Dealing…
        </div>
      </Row>
    );
  } else {
    content = (
      <Row key="idle" id="idle">
        <div className="hidden h-12 flex-1 items-center justify-center text-[13px] text-white/45 lg:flex">
          {revealing ? 'Dealing…' : !canDeal && !busy ? null : hasPrevious ? 'Press Space to rebet' : 'Place your bet · press Space to deal'}
        </div>
        <div className="flex flex-1 gap-2 lg:hidden">
          {hasPrevious ? (
            <Button variant="secondary" size="lg" className="h-12 shrink-0 px-4" disabled={!canDeal || busy || revealing} onClick={onRebetDouble} leftIcon={<RotateCcw size={15} />} data-testid="bj-rebet-x2-mobile">
              ×2
            </Button>
          ) : null}
          <Button variant="primary" size="lg" className="h-12 flex-1" disabled={!canDeal || busy || revealing} loading={pending === 'DEAL'} onClick={onDeal} data-testid="bj-deal-mobile">
            {hasPrevious ? 'Rebet' : 'Deal'} · {formatCredits(bet)}
          </Button>
        </div>
      </Row>
    );
  }

  // Enter-only transitions: a new server state must never wait on an exit animation.
  return content;
}
