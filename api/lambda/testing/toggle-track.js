import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApiPool } from '@sterio/db-config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({
  path: path.resolve(__dirname, '../.env')
});

const TRACK_ID = 140;
const action = process.argv[2];

if (!['show', 'hide'].includes(action)) {
  console.error('Usage: node toggle-track-140.js <show|hide>');
  process.exit(1);
}

const pool = createApiPool();

const updatesByAction = {
  hide: {
    query: `
      UPDATE tracks
      SET processing_status = 'waiting_for_approval'
      WHERE id = $1
      RETURNING id, processing_status, created_at
    `,
    message: 'Track hidden from public view.'
  },
  show: {
    query: `
      UPDATE tracks
      SET processing_status = 'completed',
          created_at = NOW()
      WHERE id = $1
      RETURNING id, processing_status, created_at
    `,
    message: 'Track made visible and timestamp refreshed.'
  }
};

try {
  const { query, message } = updatesByAction[action];
  const result = await pool.query(query, [TRACK_ID]);

  if (result.rowCount === 0) {
    console.error(`Track ${TRACK_ID} was not found.`);
    process.exitCode = 1;
  } else {
    console.log(message);
    console.log(result.rows[0]);
  }
} catch (error) {
  console.error('Failed to update track status:', error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
