import { notFound } from 'next/navigation';
import { devToolsEnabled } from '@/server/env';

/** The dev panel route does not exist unless dev tools are enabled (never in production). */
export const dynamic = 'force-dynamic';

export default function DevLayout({ children }: { children: React.ReactNode }) {
  if (!devToolsEnabled()) notFound();
  return children;
}
