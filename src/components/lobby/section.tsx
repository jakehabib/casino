import type { ReactNode } from 'react';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';

export function LobbySection({ title, subtitle, href, children, icon }: { title: string; subtitle?: string; href?: string; children: ReactNode; icon?: ReactNode }) {
  return (
    <section className="mt-10">
      <div className="mb-4 flex items-end justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 text-[17px] font-semibold tracking-tight text-fg">
            {icon}
            {title}
          </h2>
          {subtitle ? <p className="mt-0.5 text-[13px] text-fg-subtle">{subtitle}</p> : null}
        </div>
        {href ? (
          <Link href={href} className="flex items-center gap-0.5 text-[13px] font-medium text-fg-muted hover:text-fg">
            View all <ChevronRight size={14} />
          </Link>
        ) : null}
      </div>
      {children}
    </section>
  );
}

export function CardRow({ children }: { children: ReactNode }) {
  return (
    <div className="scrollbar-none -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:px-6 lg:mx-0 lg:grid lg:grid-cols-7 lg:overflow-visible lg:px-0">
      {children}
    </div>
  );
}
