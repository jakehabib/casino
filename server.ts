/**
 * NOVA application server: Next.js + Socket.IO (realtime chat, crash, wallet
 * pushes) in one Node process. See docs/ARCHITECTURE.md.
 */
import 'dotenv/config';
import { createServer } from 'node:http';
import next from 'next';
import { createSocketServer } from '@/server/socket/server';
import { logger } from '@/server/logger';

const port = parseInt(process.env.PORT || '3000', 10);
const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev, port, hostname: '0.0.0.0' });
const handle = app.getRequestHandler();

async function main() {
  await app.prepare();
  const http = createServer((req, res) => {
    // Authoritative peer address for rate limiting (see clientIp in src/server/api/handler.ts).
    req.headers['x-nova-peer-ip'] = req.socket.remoteAddress ?? '';
    void handle(req, res);
  });
  await createSocketServer(http, { origin: process.env.APP_URL ?? `http://localhost:${port}` });
  http.listen(port, () => {
    logger.info({ port, dev }, `NOVA ready on http://localhost:${port}`);
  });

  const shutdown = (signal: string) => {
    logger.info({ signal }, 'shutting down');
    http.close();
    setTimeout(() => process.exit(0), 1500).unref();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

process.on('unhandledRejection', (err) => logger.error({ err }, 'unhandledRejection'));

main().catch((err) => {
  logger.fatal({ err }, 'failed to start');
  // Also print plainly: some log viewers only show the message field.
  console.error('[nova] FAILED TO START:', err instanceof Error ? err.stack ?? err.message : err);
  if (err instanceof Error && /MaxRetriesPerRequest|ECONNREFUSED|ENOTFOUND|EAI_AGAIN/.test(`${err.name} ${err.message}`)) {
    console.error('[nova] Could not reach Redis. Check that REDIS_URL points at your Redis service (on Railway: Variables -> REDIS_URL = ${{Redis.REDIS_URL}}).');
  }
  process.exit(1);
});
