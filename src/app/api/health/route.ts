import { NextResponse } from 'next/server';
import { prisma } from '@/server/db';
import { redis } from '@/server/redis';

export const dynamic = 'force-dynamic';

async function timed<T>(fn: () => Promise<T>) {
  const t = Date.now();
  try {
    await Promise.race([fn(), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 2000))]);
    return { ok: true, latencyMs: Date.now() - t };
  } catch {
    return { ok: false, latencyMs: Date.now() - t };
  }
}

export async function GET() {
  const [database, cache] = await Promise.all([timed(() => prisma.$queryRaw`SELECT 1`), timed(() => redis.ping())]);
  const ok = database.ok && cache.ok;
  return NextResponse.json(
    { status: ok ? 'ok' : 'degraded', app: { ok: true, uptimeSec: Math.round(process.uptime()) }, database, redis: cache, time: new Date().toISOString() },
    { status: ok ? 200 : 503, headers: { 'Cache-Control': 'no-store' } },
  );
}
