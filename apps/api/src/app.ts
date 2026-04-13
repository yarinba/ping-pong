import Fastify, { type FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import type { Client as TemporalClient } from '@temporalio/client';
import { randomUUID } from 'node:crypto';
import { pingPongWorkflow, TASK_QUEUE } from '@ping-pong/shared';

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

    await deps.temporal.workflow.start(pingPongWorkflow, {
      args: [id],
      workflowId: `ping-${id}`,
      taskQueue: TASK_QUEUE,
    });

    reply.code(201);
    return row;
  });

  app.get('/pings', async () => {
    const result = await deps.pool.query(
      'SELECT * FROM pings ORDER BY created_at DESC LIMIT 50',
    );
    return result.rows;
  });

  return app;
}
