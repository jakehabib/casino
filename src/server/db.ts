import { PrismaClient, Prisma } from '@prisma/client';

const g = globalThis as unknown as { __novaPrisma?: PrismaClient };

export const prisma: PrismaClient =
  g.__novaPrisma ??
  new PrismaClient({
    log: process.env.PRISMA_LOG === 'query' ? ['query', 'warn', 'error'] : ['warn', 'error'],
  });

g.__novaPrisma = prisma;

export type Tx = Prisma.TransactionClient;
export { Prisma };

/**
 * Run `fn` inside an interactive transaction. All game settlement and wallet
 * movement goes through here so that it is atomic.
 */
export function transaction<T>(fn: (tx: Tx) => Promise<T>, opts?: { timeout?: number }): Promise<T> {
  return prisma.$transaction(fn, {
    timeout: opts?.timeout ?? 15_000,
    maxWait: 10_000,
    isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
  });
}

export function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
}
