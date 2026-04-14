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
