import { Pool } from 'pg';

export async function createPool(connectionString: string, attempts = 5): Promise<Pool> {
  let lastErr: unknown;
  for (let i = 1; i <= attempts; i++) {
    try {
      const pool = new Pool({ connectionString });
      await pool.query('SELECT 1');
      return pool;
    } catch (err) {
      lastErr = err;
      const wait = 1000 * i;
      console.warn(`[api] postgres connect attempt ${i}/${attempts} failed; retrying in ${wait}ms`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  throw lastErr;
}
