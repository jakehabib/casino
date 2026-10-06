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
const app = next({ dev, port, hostname: process.env.HOSTNAME || '0.0.0.0' });
const handle = app.getRequestHandler();

async function main() {
  await app.prepare();
  const http = createServer((req, res) => {
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
  process.exit(1);
});
