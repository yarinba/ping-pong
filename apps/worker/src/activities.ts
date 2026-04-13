import type { Pool } from 'pg';
import type { Activities } from '@ping-pong/shared';

export function makeActivities(pool: Pool): Activities {
  return {
    async respondWithPong(id: string): Promise<void> {
      const result = await pool.query(
        "UPDATE pings SET response = 'pong', status = 'done', responded_at = NOW() WHERE id = $1",
        [id],
      );
      if (result.rowCount === 0) {
        throw new Error(`ping not found: ${id}`);
      }
    },
  };
}
