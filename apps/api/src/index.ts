import { buildApp } from './app.js';
import { createPool } from './db.js';
import { createTemporalClient } from './temporal.js';

const PORT = Number(process.env.PORT ?? 3000);
const HOST = process.env.HOST ?? '0.0.0.0';
const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://postgres:postgres@postgres:5432/hello_world';
const TEMPORAL_ADDRESS = process.env.TEMPORAL_ADDRESS ?? 'temporal:7233';

async function main() {
  const pool = await createPool(DATABASE_URL);
  const temporal = await createTemporalClient(TEMPORAL_ADDRESS);
  const app = buildApp({ pool, temporal });

  const shutdown = async (sig: string) => {
    app.log.info({ sig }, 'shutting down');
    await app.close();
    await pool.end();
    await temporal.connection.close();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  await app.listen({ host: HOST, port: PORT });
}

main().catch((err) => {
  console.error('[api] fatal:', err);
  process.exit(1);
});
