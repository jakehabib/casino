import type { NovaIO } from './io';
import { logger } from '@/server/logger';

/**
 * Socket feature modules (crash, chat). Each exports `register(io)`.
 * Loaded dynamically so a failing module is logged instead of taking down
 * the whole realtime layer.
 */
export async function registerSocketModules(io: NovaIO) {
  const mods: [string, () => Promise<{ register: (io: NovaIO) => void | Promise<void> }>][] = [
    ['chat', () => import('@/server/services/chat/chat-socket')],
    ['crash', () => import('@/server/services/crash/crash-socket')],
  ];
  for (const [name, load] of mods) {
    try {
      const mod = await load();
      await mod.register(io);
      logger.info({ module: name }, 'socket module registered');
    } catch (err) {
      logger.error({ err, module: name }, 'socket module failed to register');
    }
  }
}
