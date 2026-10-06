'use client';
import { useQuery } from '@tanstack/react-query';
import { Megaphone, X } from 'lucide-react';
import { useState } from 'react';
import { api } from '@/lib/api';

export function AnnouncementBanner() {
  const { data } = useQuery({ queryKey: ['site'], queryFn: () => api.get<{ announcement: string; maintenanceMode: boolean }>('/api/site'), staleTime: 60_000 });
  const [hidden, setHidden] = useState<string | null>(null);
  const text = data?.maintenanceMode ? 'Games are paused for scheduled maintenance. Your balance is safe.' : data?.announcement;
  if (!text || hidden === text) return null;
  return (
    <div className="flex items-center gap-3 border-b border-line-soft bg-accent-soft px-4 py-2 text-[13px] text-fg sm:px-6">
      <Megaphone size={15} className="shrink-0 text-accent" />
      <span className="flex-1">{text}</span>
      <button onClick={() => setHidden(text)} className="rounded p-1 text-fg-subtle hover:text-fg" aria-label="Dismiss announcement">
        <X size={14} />
      </button>
    </div>
  );
}
