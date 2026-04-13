import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { TestWorkflowEnvironment } from '@temporalio/testing';
import { Worker } from '@temporalio/worker';
import { pingPongWorkflow, TASK_QUEUE } from '@ping-pong/shared';

describe('pingPongWorkflow', () => {
  let env: TestWorkflowEnvironment;

  beforeAll(async () => {
    env = await TestWorkflowEnvironment.createLocal();
  }, 30_000);

  afterAll(async () => {
    await env?.teardown();
  });

  it('invokes respondWithPong with the given id and completes', async () => {
    const respondWithPong = vi.fn().mockResolvedValue(undefined);

    const worker = await Worker.create({
      connection: env.nativeConnection,
      taskQueue: TASK_QUEUE,
      workflowsPath: require.resolve('@ping-pong/shared/workflows'),
      activities: { respondWithPong },
    });

    await worker.runUntil(
      env.client.workflow.execute(pingPongWorkflow, {
        args: ['abc-123'],
        workflowId: 'test-ping-abc-123',
        taskQueue: TASK_QUEUE,
      }),
    );

    expect(respondWithPong).toHaveBeenCalledWith('abc-123');
  }, 30_000);
});
