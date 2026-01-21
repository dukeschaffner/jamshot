

import 'dotenv/config';
import honoApp from './src/hono-api.js';
import expressApp from './src/express-api.js';
import { serve } from '@hono/node-server'

const PORT = process.env.PORT || 5001;


serve({
  fetch: honoApp.fetch,
  port: 5002,
});

expressApp.listen(5001, () => {
  console.log('Express server running on port 5001');
});


// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down server...');
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Shutting down server...');
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});
