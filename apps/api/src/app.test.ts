import { describe, it, expect, vi } from 'vitest';
import { buildApp } from './app.js';

function makeDeps() {
  const query = vi.fn();
  const start = vi.fn().mockResolvedValue({ workflowId: 'ping-x' });
  const pool = { query } as unknown as import('pg').Pool;
  const temporal = { workflow: { start } } as unknown as import('@temporalio/client').Client;
  return { pool, temporal, query, start };
}

describe('POST /pings', () => {
  it('inserts a row and starts a workflow', async () => {
    const { pool, temporal, query, start } = makeDeps();
    query.mockResolvedValueOnce({
      rows: [{ id: 'abc', message: 'ping', status: 'pending', created_at: new Date().toISOString() }],
      rowCount: 1,
    });

    const app = buildApp({ pool, temporal });
    const res = await app.inject({ method: 'POST', url: '/pings' });

    expect(res.statusCode).toBe(201);
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][0]).toMatch(/INSERT\s+INTO\s+pings/i);
    expect(start).toHaveBeenCalledTimes(1);
    const body = res.json();
    expect(body.id).toBe('abc');
    expect(body.status).toBe('pending');

    await app.close();
  });
});

describe('GET /pings', () => {
  it('returns recent pings ordered by created_at desc', async () => {
    const { pool, temporal, query } = makeDeps();
    query.mockResolvedValueOnce({
      rows: [
        { id: '2', message: 'ping', status: 'done', created_at: '2026-04-13T00:00:01Z' },
        { id: '1', message: 'ping', status: 'pending', created_at: '2026-04-13T00:00:00Z' },
      ],
      rowCount: 2,
    });

    const app = buildApp({ pool, temporal });
    const res = await app.inject({ method: 'GET', url: '/pings' });

    expect(res.statusCode).toBe(200);
    expect(query.mock.calls[0][0]).toMatch(/SELECT[\s\S]+FROM\s+pings[\s\S]+ORDER\s+BY\s+created_at\s+DESC/i);
    expect(res.json()).toHaveLength(2);

    await app.close();
  });
});

describe('GET /healthz', () => {
  it('returns 200 with status ok', async () => {
    const { pool, temporal } = makeDeps();
    const app = buildApp({ pool, temporal });
    const res = await app.inject({ method: 'GET', url: '/healthz' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok' });
    await app.close();
  });
});
