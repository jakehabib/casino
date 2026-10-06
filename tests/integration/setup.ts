import 'dotenv/config';
import { beforeAll } from 'vitest';

// Point every server module at the test database + an isolated Redis DB.
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL!;
process.env.REDIS_URL = (process.env.REDIS_URL ?? 'redis://localhost:6379').replace(/\/\d*$/, '') + '/15';
process.env.ENABLE_DEV_TOOLS = 'true';
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';

beforeAll(async () => {
  const { resetDatabase } = await import('./helpers');
  await resetDatabase();
});
