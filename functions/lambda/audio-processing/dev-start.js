#!/usr/bin/env node
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Parse command line arguments
const useBuilt = process.argv.includes('-b') || process.argv.includes('--built');

console.log('🎵 Starting Jamshot Audio Processing Dev Server');
console.log('==============================================');
if (useBuilt) {
  console.log('📦 Using built code from /dist\n');
} else {
  console.log('📝 Using source code\n');
}

// Track all processes
const processes = [];
let shuttingDown = false;

// Function to start a service
function startService(name, command, args, cwd, env = {}) {
  console.log(`🔄 Starting ${name}...`);

  const proc = spawn(command, args, {
    cwd: cwd,
    env: { ...process.env, ...env },
    stdio: ['inherit', 'pipe', 'pipe']
  });

  // Pipe output with service name prefix
  proc.stdout.on('data', (data) => {
    const lines = data.toString().trim().split('\n');
    lines.forEach(line => {
      if (line.trim()) console.log(`[${name}] ${line}`);
    });
  });

  proc.stderr.on('data', (data) => {
    const lines = data.toString().trim().split('\n');
    lines.forEach(line => {
      if (line.trim()) console.log(`[${name}] ${line}`);
    });
  });

  proc.on('close', (code) => {
    if (!shuttingDown) {
      console.log(`❌ ${name} exited with code ${code}`);
      shutdown();
    }
  });

  proc.on('error', (error) => {
    console.error(`❌ ${name} failed to start:`, error.message);
    shutdown();
  });

  processes.push({ name, proc });
  return proc;
}

// Function to shutdown all services
function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;

  console.log('\n🛑 Shutting down all services...');

  processes.forEach(({ name, proc }) => {
    console.log(`Stopping ${name}...`);
    try {
      proc.kill('SIGTERM');
    } catch (error) {
      console.error(`Error stopping ${name}:`, error.message);
    }
  });

  // Force exit after 5 seconds
  setTimeout(() => {
    console.log('Force exiting...');
    process.exit(1);
  }, 5000);
}

// Start audio processing service
try {
  startService(
    'Audio Processing',
    'node',
    ['dev-server.js'],
    __dirname,
    { USE_BUILT: useBuilt ? 'true' : 'false' }
  );

  console.log('🎵 Audio processing monitor started successfully!');
  console.log('📊 Monitoring database for tracks needing processing...\n');

} catch (error) {
  console.error('❌ Failed to start audio processing monitor:', error.message);
  shutdown();
}

// Handle graceful shutdown
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught exception:', error);
  shutdown();
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled rejection at:', promise, 'reason:', reason);
  shutdown();
});
