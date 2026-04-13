import { proxyActivities } from '@temporalio/workflow';
import type { Activities } from './index.js';

const { respondWithPong } = proxyActivities<Activities>({
  startToCloseTimeout: '5s',
});

export async function pingPongWorkflow(id: string): Promise<void> {
  await respondWithPong(id);
}
