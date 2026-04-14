import { proxyActivities } from '@temporalio/workflow';
import type { Activities } from './index.js';

const { respondWithMessage } = proxyActivities<Activities>({
  startToCloseTimeout: '5s',
});

export async function respondWorkflow(id: string, response: string): Promise<void> {
  await respondWithMessage(id, response);
}
