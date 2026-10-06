import Link from 'next/link';
import { LogoMark } from '@/components/brand/logo';

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
      <LogoMark size={40} />
      <h1 className="mt-6 text-2xl font-semibold tracking-tight">This table doesn’t exist</h1>
      <p className="mt-2 text-sm text-fg-muted">The page you’re looking for has moved or never existed.</p>
      <Link href="/" className="mt-6 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-hover">
        Back to the lobby
      </Link>
    </div>
  );
}
