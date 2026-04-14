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
