
import { createServer } from 'http';
import honoApp from './src/hono-api.js';
import expressApp from './src/express-api.js';

const PORT = process.env.PORT || 5001;

const server = createServer(async (req, res) => {
  try {
    // Construct full URL
    const url = new URL(req.url, `http://localhost:${PORT}`);

    // Determine if this is an auth request (similar to lambda handler logic)
    const isAuthRequest = url.pathname && url.pathname.includes('/api/auth');

    if (isAuthRequest) {
      // Route auth requests to Hono handler
      console.log('🔀 Routing to Hono auth handler');

      // Create headers from Node.js request
      const headers = new Headers();
      Object.keys(req.headers).forEach(key => {
        const value = req.headers[key];
        if (Array.isArray(value)) {
          value.forEach(v => headers.append(key, v));
        } else if (value) {
          headers.set(key, value);
        }
      });

      // Create Web API Request object
      const request = new Request(url.toString(), {
        method: req.method,
        headers,
        body: ['GET', 'HEAD'].includes(req.method) ? undefined : req,
        duplex: ['GET', 'HEAD'].includes(req.method) ? undefined : 'half'
      });

      // Process through Hono app
      const response = await honoApp.fetch(request);

      // Convert Hono response back to Node.js response
      res.statusCode = response.status;
      response.headers.forEach((value, key) => {
        res.setHeader(key, value);
      });

      const body = await response.text();
      res.end(body);
    } else {
      // Route all other requests to Express handler
      console.log('🔀 Routing to Express API handler');
      expressApp(req, res);
    }
  } catch (error) {
    console.error('Server error:', error);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Internal server error', message: error.message }));
  }
});

server.listen(PORT, () => {
  console.log(`🚀 Development server running on http://localhost:${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
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
