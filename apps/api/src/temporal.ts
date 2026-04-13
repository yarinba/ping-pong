import { Client, Connection } from '@temporalio/client';

export async function createTemporalClient(address: string, attempts = 5): Promise<Client> {
  let lastErr: unknown;
  for (let i = 1; i <= attempts; i++) {
    try {
      const connection = await Connection.connect({ address });
      return new Client({ connection, namespace: 'default' });
    } catch (err) {
      lastErr = err;
      const wait = 1000 * i;
      console.warn(`[api] temporal connect attempt ${i}/${attempts} failed; retrying in ${wait}ms`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  throw lastErr;
}
