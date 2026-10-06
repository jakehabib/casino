import { hash, verify } from '@node-rs/argon2';

// Argon2id (algorithm 2) with OWASP-recommended parameters.
const OPTS = { algorithm: 2 as const, memoryCost: 19_456, timeCost: 2, parallelism: 1 };

export function hashPassword(password: string): Promise<string> {
  return hash(password, OPTS);
}

export async function verifyPassword(passwordHash: string | null, password: string): Promise<boolean> {
  if (!passwordHash) return false;
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

/** Dummy hash used to equalise timing when a user does not exist. */
let dummy: string | null = null;
export async function dummyVerify(password: string) {
  dummy ??= await hashPassword('nova-timing-equaliser');
  await verifyPassword(dummy, password);
}
