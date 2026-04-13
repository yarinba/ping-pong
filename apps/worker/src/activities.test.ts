import { describe, it, expect, vi } from 'vitest';
import { makeActivities } from './activities.js';

describe('respondWithPong', () => {
  it('updates the ping row to status=done with response=pong', async () => {
    const query = vi.fn().mockResolvedValue({ rowCount: 1 });
    const pool = { query } as unknown as import('pg').Pool;

    const { respondWithPong } = makeActivities(pool);
    await respondWithPong('abc-123');

    expect(query).toHaveBeenCalledTimes(1);
    const [sql, params] = query.mock.calls[0];
    expect(sql).toMatch(/UPDATE\s+pings/i);
    expect(sql).toMatch(/status\s*=\s*'done'/i);
    expect(sql).toMatch(/response\s*=\s*'pong'/i);
    expect(params).toEqual(['abc-123']);
  });

  it('throws if no row was updated', async () => {
    const query = vi.fn().mockResolvedValue({ rowCount: 0 });
    const pool = { query } as unknown as import('pg').Pool;

    const { respondWithPong } = makeActivities(pool);
    await expect(respondWithPong('missing')).rejects.toThrow(/not found/i);
  });
});
