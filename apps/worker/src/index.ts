import { NativeConnection, Worker } from '@temporalio/worker';
import { Pool } from 'pg';
import { TASK_QUEUE } from '@ping-pong/shared';
import { makeActivities } from './activities.js';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

const TEMPORAL_ADDRESS = process.env.TEMPORAL_ADDRESS ?? 'temporal:7233';
const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://postgres:postgres@postgres:5432/hello_world';

async function connectWithRetry<T>(label: string, fn: () => Promise<T>, attempts = 5): Promise<T> {
  let lastErr: unknown;
  for (let i = 1; i <= attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const wait = 1000 * i;
      console.warn(`[worker] ${label} connect attempt ${i}/${attempts} failed; retrying in ${wait}ms`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  throw lastErr;
}

async function main() {
  const pool = await connectWithRetry('postgres', async () => {
    const p = new Pool({ connectionString: DATABASE_URL });
    await p.query('SELECT 1');
    return p;
  });

  const connection = await connectWithRetry('temporal', () =>
    NativeConnection.connect({ address: TEMPORAL_ADDRESS }),
  );

  const worker = await Worker.create({
    connection,
    namespace: 'default',
    taskQueue: TASK_QUEUE,
    workflowsPath: require.resolve('@ping-pong/shared/workflows'),
    activities: makeActivities(pool),
  });

  const shutdown = async (sig: string) => {
    console.log(`[worker] received ${sig}, shutting down`);
    worker.shutdown();
    await pool.end();
    await connection.close();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  console.log(`[worker] running on task queue '${TASK_QUEUE}'`);
  await worker.run();
  console.log('[worker] exited cleanly');
}

main().catch((err) => {
  console.error('[worker] fatal:', err);
  process.exit(1);
});
