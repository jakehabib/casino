'use client';
import { useState } from 'react';
import { Smile } from 'lucide-react';
import { Popover } from '@/components/ui/popover';
import { cn } from '@/lib/cn';

/** Curated standard-Unicode emoji (no external library, renders with the system font). */
export const EMOJI_GROUPS: { label: string; items: string[] }[] = [
  { label: 'Faces', items: ['😀', '😂', '🤣', '😊', '😍', '🥳', '😎', '🤩', '😇', '🙂', '😉', '😅', '😬', '🤔', '🙃', '😏', '😴', '😮', '😱', '😭', '😤', '😡', '🤯', '🤑'] },
  { label: 'Gestures', items: ['🙏', '👏', '🙌', '👍', '👎', '👋', '🤝', '💪', '✌️', '🤞', '👀', '🫶'] },
  { label: 'Table talk', items: ['🔥', '💯', '✨', '⚡', '🎉', '🏆', '🥇', '💎', '💰', '🍀', '🎰', '🃏', '♠️', '♥️', '♦️', '♣️', '🎲', '🚀', '📈', '📉', '❤️', '💜', '⭐', '🌙'] },
];

export function EmojiPicker({ onPick, disabled }: { onPick: (e: string) => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      side="top"
      align="start"
      className="w-[296px] p-2"
      trigger={
        <button
          type="button"
          disabled={disabled}
          aria-label="Insert emoji"
          className={cn(
            'flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-fg-subtle transition-colors hover:bg-surface-3 hover:text-fg disabled:opacity-40',
            open && 'bg-surface-3 text-fg',
          )}
        >
          <Smile size={17} />
        </button>
      }
    >
      <div className="max-h-[260px] overflow-y-auto pr-0.5" data-testid="emoji-picker">
        {EMOJI_GROUPS.map((g) => (
          <div key={g.label} className="mb-1.5 last:mb-0">
            <div className="px-1 pb-1 pt-0.5 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-fg-subtle">{g.label}</div>
            <div className="grid grid-cols-8 gap-0.5">
              {g.items.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => onPick(e)}
                  className="flex h-8 w-8 items-center justify-center rounded-md text-[19px] leading-none transition-transform duration-100 hover:scale-110 hover:bg-surface-3 active:scale-95"
                  aria-label={`Insert ${e}`}
                >
                  {e}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Popover>
  );
}
