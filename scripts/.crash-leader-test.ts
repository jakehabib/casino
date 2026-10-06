import 'dotenv/config';
import { register } from '@/server/services/crash/crash-socket';
register({ on() {} } as never);
setTimeout(() => process.exit(0), Number(process.env.RUN_MS ?? 8000));
