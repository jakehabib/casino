import type { Metadata, Viewport } from 'next';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import { Providers } from '@/components/providers';
import { BRAND } from '@/lib/branding';
import './globals.css';

export const metadata: Metadata = {
  title: { default: `${BRAND.name} — Social Casino`, template: `%s · ${BRAND.name}` },
  description: 'A premium play-money social casino. Blackjack, Baccarat, Roulette, Crash and original slots.',
  applicationName: BRAND.name,
};

export const viewport: Viewport = {
  themeColor: '#0a0b0e',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`} suppressHydrationWarning>
      <body>
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[200] focus:rounded-md focus:bg-accent focus:px-3 focus:py-2 focus:text-sm focus:font-semibold">
          Skip to content
        </a>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
