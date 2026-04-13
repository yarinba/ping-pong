export { pingPongWorkflow } from './workflows.js';

export interface Activities {
  respondWithPong(id: string): Promise<void>;
}

export const TASK_QUEUE = 'ping-pong';
