import { describe, it, expect, vi } from 'vitest';
import { makeActivities } from './activities.js';

describe('respondWithMessage', () => {
  it('updates the row to status=done with the given response', async () => {
    const query = vi.fn().mockResolvedValue({ rowCount: 1 });
    const pool = { query } as unknown as import('pg').Pool;

    const { respondWithMessage } = makeActivities(pool);
    await respondWithMessage('abc-123', 'pong');

    expect(query).toHaveBeenCalledTimes(1);
    const [sql, params] = query.mock.calls[0];
    expect(sql).toMatch(/UPDATE\s+pings/i);
    expect(sql).toMatch(/status\s*=\s*'done'/i);
    expect(params).toEqual(['abc-123', 'pong']);
  });

  it('works for dong response too', async () => {
    const query = vi.fn().mockResolvedValue({ rowCount: 1 });
    const pool = { query } as unknown as import('pg').Pool;

    const { respondWithMessage } = makeActivities(pool);
    await respondWithMessage('def-456', 'dong');

    const [, params] = query.mock.calls[0];
    expect(params).toEqual(['def-456', 'dong']);
  });

  it('throws if no row was updated', async () => {
    const query = vi.fn().mockResolvedValue({ rowCount: 0 });
    const pool = { query } as unknown as import('pg').Pool;

    const { respondWithMessage } = makeActivities(pool);
    await expect(respondWithMessage('missing', 'pong')).rejects.toThrow(/not found/i);
  });
});
