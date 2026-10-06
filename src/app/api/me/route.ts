import { NextResponse } from 'next/server';
import { route } from '@/server/api/handler';
import { getMe } from '@/server/services/account/me';

export const GET = route({}, async ({ user }) => {
  if (!user) return NextResponse.json({ user: null }, { headers: { 'Cache-Control': 'no-store' } });
  return getMe(user);
});
