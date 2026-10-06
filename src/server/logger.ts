import pino from 'pino';

const g = globalThis as unknown as { __novaLogger?: pino.Logger };

/**
 * Structured logger. Secrets are redacted at the serializer level so that a
 * careless `logger.info({ user })` can never leak them.
 */
export const logger: pino.Logger =
  g.__novaLogger ??
  pino({
    level: process.env.LOG_LEVEL ?? 'info',
    base: { app: 'nova' },
    redact: {
      paths: [
        'password',
        '*.password',
        'passwordHash',
        '*.passwordHash',
        'token',
        '*.token',
        'tokenHash',
        '*.tokenHash',
        'cookie',
        '*.cookie',
        'headers.cookie',
        'seed',
        '*.seed',
        'serverSeed',
        '*.serverSeed',
      ],
      censor: '[redacted]',
    },
  });
g.__novaLogger = logger;
