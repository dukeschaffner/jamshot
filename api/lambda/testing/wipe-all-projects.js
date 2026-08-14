/**
 * Local-only script to wipe all project data (DB + R2).
 * Loads env/.env.dev (and overlays) before connecting to the database.
 *
 * Usage (from api/lambda):
 *   npm run wipe-projects
 *   npm run wipe-projects:confirm
 */
import { loadApiEnv } from './loadApiEnv.js';

loadApiEnv();

const { assertLocalDevOnly, wipeAllProjectData } = await import(
  '../src/utils/projectDevWipeUtils.js'
);

async function main() {
  assertLocalDevOnly();

  const confirm = process.argv.includes('--confirm');

  if (!confirm) {
    console.log('Dry run (pass --confirm to actually delete everything):\n');
  } else {
    console.log('Wiping all project data...\n');
  }

  const result = await wipeAllProjectData({
    dryRun: !confirm,
    confirm,
  });

  console.log(JSON.stringify(result, null, 2));

  if (!confirm) {
    console.log('\nNo data was deleted. Re-run with --confirm to wipe.');
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
