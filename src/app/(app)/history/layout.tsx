import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Game history' };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
