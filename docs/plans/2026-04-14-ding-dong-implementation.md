# Ding/Dong Feature Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a ding/dong flow (POST /dings → dong) alongside ping/pong, using a generalized Temporal workflow, with a renamed GET /messages endpoint and a new "Send Ding" button in the UI.

**Architecture:** Replace the ping-specific `pingPongWorkflow` and `respondWithPong` activity with a generic `respondWorkflow(id, response)` and `respondWithMessage(id, response)` that accept the response string as a parameter. The existing `POST /pings` continues to work by passing `'pong'`; the new `POST /dings` passes `'dong'`. The `GET /pings` endpoint is renamed to `GET /messages` and returns all rows from the shared `pings` table.

**Tech Stack:** TypeScript, Fastify, Temporal.io, Vitest, React, pnpm monorepo

---

### Task 1: Generalize the shared package (types + workflow)

**Files:**
- Modify: `packages/shared/src/index.ts`
- Modify: `packages/shared/src/workflows.ts`

There are no unit tests for the shared package itself — downstream tests in api and worker cover it. This task is pure type/logic changes; the build is the verification.

**Step 1: Update `packages/shared/src/workflows.ts`**

Replace the entire file:

```ts
import { proxyActivities } from '@temporalio/workflow';
import type { Activities } from './index.js';

const { respondWithMessage } = proxyActivities<Activities>({
  startToCloseTimeout: '5s',
});

export async function respondWorkflow(id: string, response: string): Promise<void> {
  await respondWithMessage(id, response);
}
```

**Step 2: Update `packages/shared/src/index.ts`**

Replace the entire file:

```ts
export { respondWorkflow } from './workflows.js';

export interface Activities {
  respondWithMessage(id: string, response: string): Promise<void>;
}

export const TASK_QUEUE = 'ping-pong';
```

**Step 3: Commit**

```bash
git add packages/shared/src/
git commit -m "refactor(shared): generalize workflow and activity to accept response param"
```

---

### Task 2: Update worker activities (TDD)

**Files:**
- Modify: `apps/worker/src/activities.test.ts`
- Modify: `apps/worker/src/activities.ts`

**Step 1: Write the failing tests**

Replace `apps/worker/src/activities.test.ts` entirely:

```ts
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
```

**Step 2: Run tests to verify they fail**

```bash
cd apps/worker && pnpm test
```

Expected: FAIL — `respondWithMessage` not defined on result of `makeActivities`

**Step 3: Update `apps/worker/src/activities.ts`**

Replace the entire file:

```ts
import type { Pool } from 'pg';
import type { Activities } from '@ping-pong/shared';

export function makeActivities(pool: Pool): Activities {
  return {
    async respondWithMessage(id: string, response: string): Promise<void> {
      const result = await pool.query(
        "UPDATE pings SET response = $2, status = 'done', responded_at = NOW() WHERE id = $1",
        [id, response],
      );
      if (result.rowCount === 0) {
        throw new Error(`ping not found: ${id}`);
      }
    },
  };
}
```

**Step 4: Run tests to verify they pass**

```bash
cd apps/worker && pnpm test
```

Expected: PASS — all 3 tests green

**Step 5: Commit**

```bash
git add apps/worker/src/
git commit -m "refactor(worker): replace respondWithPong with respondWithMessage(id, response)"
```

---

### Task 3: Update worker workflow test

**Files:**
- Modify: `apps/worker/src/workflow.test.ts`

**Step 1: Update the workflow test**

Replace `apps/worker/src/workflow.test.ts` entirely:

```ts
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { TestWorkflowEnvironment } from '@temporalio/testing';
import { Worker } from '@temporalio/worker';
import { respondWorkflow, TASK_QUEUE } from '@ping-pong/shared';

describe('respondWorkflow', () => {
  let env: TestWorkflowEnvironment;

  beforeAll(async () => {
    env = await TestWorkflowEnvironment.createLocal();
  }, 30_000);

  afterAll(async () => {
    await env?.teardown();
  });

  it('invokes respondWithMessage with the given id and response, then completes', async () => {
    const respondWithMessage = vi.fn().mockResolvedValue(undefined);

    const worker = await Worker.create({
      connection: env.nativeConnection,
      taskQueue: TASK_QUEUE,
      workflowsPath: require.resolve('@ping-pong/shared/workflows'),
      activities: { respondWithMessage },
    });

    await worker.runUntil(
      env.client.workflow.execute(respondWorkflow, {
        args: ['abc-123', 'pong'],
        workflowId: 'test-respond-abc-123',
        taskQueue: TASK_QUEUE,
      }),
    );

    expect(respondWithMessage).toHaveBeenCalledWith('abc-123', 'pong');
  }, 30_000);
});
```

**Step 2: Run tests to verify they pass**

```bash
cd apps/worker && pnpm test
```

Expected: PASS (the test environment spins up a local Temporal server; allow up to 30s)

**Step 3: Commit**

```bash
git add apps/worker/src/workflow.test.ts
git commit -m "test(worker): update workflow test to use respondWorkflow"
```

---

### Task 4: Update API — new endpoints and renamed list route (TDD)

**Files:**
- Modify: `apps/api/src/app.test.ts`
- Modify: `apps/api/src/app.ts`

**Step 1: Write the failing tests**

Replace `apps/api/src/app.test.ts` entirely:

```ts
import { describe, it, expect, vi } from 'vitest';
import { buildApp } from './app.js';

function makeDeps() {
  const query = vi.fn();
  const start = vi.fn().mockResolvedValue({ workflowId: 'x' });
  const pool = { query } as unknown as import('pg').Pool;
  const temporal = { workflow: { start } } as unknown as import('@temporalio/client').Client;
  return { pool, temporal, query, start };
}

describe('POST /pings', () => {
  it('inserts a row and starts a workflow with response=pong', async () => {
    const { pool, temporal, query, start } = makeDeps();
    query.mockResolvedValueOnce({
      rows: [{ id: 'abc', message: 'ping', status: 'pending', created_at: new Date().toISOString() }],
      rowCount: 1,
    });

    const app = buildApp({ pool, temporal });
    const res = await app.inject({ method: 'POST', url: '/pings' });

    expect(res.statusCode).toBe(201);
    expect(query.mock.calls[0][0]).toMatch(/INSERT\s+INTO\s+pings/i);
    expect(query.mock.calls[0][1]).toContain('ping');
    expect(start).toHaveBeenCalledTimes(1);
    expect(start.mock.calls[0][1].args).toContain('pong');
    const body = res.json();
    expect(body.id).toBe('abc');
    expect(body.status).toBe('pending');

    await app.close();
  });
});

describe('POST /dings', () => {
  it('inserts a ding row and starts a workflow with response=dong', async () => {
    const { pool, temporal, query, start } = makeDeps();
    query.mockResolvedValueOnce({
      rows: [{ id: 'def', message: 'ding', status: 'pending', created_at: new Date().toISOString() }],
      rowCount: 1,
    });

    const app = buildApp({ pool, temporal });
    const res = await app.inject({ method: 'POST', url: '/dings' });

    expect(res.statusCode).toBe(201);
    expect(query.mock.calls[0][0]).toMatch(/INSERT\s+INTO\s+pings/i);
    expect(query.mock.calls[0][1]).toContain('ding');
    expect(start).toHaveBeenCalledTimes(1);
    expect(start.mock.calls[0][1].args).toContain('dong');
    const body = res.json();
    expect(body.message).toBe('ding');

    await app.close();
  });
});

describe('GET /messages', () => {
  it('returns all rows (pings and dings) ordered by created_at desc', async () => {
    const { pool, temporal, query } = makeDeps();
    query.mockResolvedValueOnce({
      rows: [
        { id: '2', message: 'ding', status: 'done', created_at: '2026-04-14T00:00:01Z' },
        { id: '1', message: 'ping', status: 'done', created_at: '2026-04-14T00:00:00Z' },
      ],
      rowCount: 2,
    });

    const app = buildApp({ pool, temporal });
    const res = await app.inject({ method: 'GET', url: '/messages' });

    expect(res.statusCode).toBe(200);
    expect(query.mock.calls[0][0]).toMatch(/SELECT[\s\S]+FROM\s+pings[\s\S]+ORDER\s+BY\s+created_at\s+DESC/i);
    expect(res.json()).toHaveLength(2);

    await app.close();
  });
});

describe('GET /healthz', () => {
  it('returns 200', async () => {
    const { pool, temporal } = makeDeps();
    const app = buildApp({ pool, temporal });
    const res = await app.inject({ method: 'GET', url: '/healthz' });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});
```

**Step 2: Run tests to verify they fail**

```bash
cd apps/api && pnpm test
```

Expected: FAIL — `POST /dings` 404, `GET /messages` 404, `POST /pings` args assertion fails

**Step 3: Update `apps/api/src/app.ts`**

Replace the entire file:

```ts
import Fastify, { type FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import type { Client as TemporalClient } from '@temporalio/client';
import { randomUUID } from 'node:crypto';
import { respondWorkflow, TASK_QUEUE } from '@ping-pong/shared';

export interface Deps {
  pool: Pool;
  temporal: TemporalClient;
}

export function buildApp(deps: Deps): FastifyInstance {
  const app = Fastify({ logger: true });

  app.get('/healthz', async () => ({ ok: true }));

  app.post('/pings', async (_req, reply) => {
    const id = randomUUID();
    const result = await deps.pool.query(
      "INSERT INTO pings (id, message, status) VALUES ($1, 'ping', 'pending') RETURNING *",
      [id],
    );
    const row = result.rows[0];

    await deps.temporal.workflow.start(respondWorkflow, {
      args: [id, 'pong'],
      workflowId: `ping-${id}`,
      taskQueue: TASK_QUEUE,
    });

    reply.code(201);
    return row;
  });

  app.post('/dings', async (_req, reply) => {
    const id = randomUUID();
    const result = await deps.pool.query(
      "INSERT INTO pings (id, message, status) VALUES ($1, 'ding', 'pending') RETURNING *",
      [id],
    );
    const row = result.rows[0];

    await deps.temporal.workflow.start(respondWorkflow, {
      args: [id, 'dong'],
      workflowId: `ding-${id}`,
      taskQueue: TASK_QUEUE,
    });

    reply.code(201);
    return row;
  });

  app.get('/messages', async () => {
    const result = await deps.pool.query(
      'SELECT * FROM pings ORDER BY created_at DESC LIMIT 50',
    );
    return result.rows;
  });

  return app;
}
```

**Step 4: Run tests to verify they pass**

```bash
cd apps/api && pnpm test
```

Expected: PASS — all 4 test suites green

**Step 5: Commit**

```bash
git add apps/api/src/
git commit -m "feat(api): add POST /dings, rename GET /pings to GET /messages, generalize workflow call"
```

---

### Task 5: Update the web UI

**Files:**
- Modify: `apps/web/src/App.tsx`

No unit tests exist for the web app. After editing, verify manually by running the full stack with `docker compose up`.

**Step 1: Update `apps/web/src/App.tsx`**

Replace the entire file:

```tsx
import { useEffect, useState } from 'react';

interface Message {
  id: string;
  message: string;
  response: string | null;
  status: string;
  created_at: string;
  responded_at: string | null;
}

export function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    const res = await fetch('/messages');
    if (res.ok) setMessages(await res.json());
  }

  async function sendPing() {
    setBusy(true);
    try {
      await fetch('/pings', { method: 'POST' });
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function sendDing() {
    setBusy(true);
    try {
      await fetch('/dings', { method: 'POST' });
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: 24, maxWidth: 720, margin: '0 auto' }}>
      <h1>Hello World — Ping/Pong & Ding/Dong</h1>
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={sendPing} disabled={busy} style={{ padding: '8px 16px', fontSize: 16 }}>
          {busy ? 'Sending…' : 'Send Ping'}
        </button>
        <button onClick={sendDing} disabled={busy} style={{ padding: '8px 16px', fontSize: 16 }}>
          {busy ? 'Sending…' : 'Send Ding'}
        </button>
      </div>
      <ul style={{ marginTop: 24, listStyle: 'none', padding: 0 }}>
        {messages.map((m) => (
          <li key={m.id} style={{ borderBottom: '1px solid #eee', padding: '8px 0', fontFamily: 'monospace' }}>
            <strong>{m.status}</strong> — {m.message} → {m.response ?? '…'}{' '}
            <span style={{ color: '#888' }}>({m.id.slice(0, 8)})</span>
          </li>
        ))}
      </ul>
    </main>
  );
}
```

**Step 2: Commit**

```bash
git add apps/web/src/App.tsx
git commit -m "feat(web): add Send Ding button, update list to fetch /messages"
```

---

### Task 6: Run full test suite

**Step 1: Run all unit tests**

```bash
pnpm test
```

Expected: all tests pass across api, worker packages

**Step 2: Commit if any fixups were needed**

Only if there were minor fixups not already committed above.

---

### Task 7: Validate end-to-end

After all unit tests pass, run the validate skill to verify the full stack works end-to-end, including regression coverage for ping/pong.

```bash
# From the repo root in this worktree
/validate
```

The validator should confirm:
- `POST /pings` → response becomes `pong`
- `POST /dings` → response becomes `dong`
- `GET /messages` returns both types
