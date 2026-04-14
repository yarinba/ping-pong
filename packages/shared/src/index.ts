export { respondWorkflow } from './workflows.js';

export interface Activities {
  respondWithMessage(id: string, response: string): Promise<void>;
}

export const TASK_QUEUE = 'ping-pong';
