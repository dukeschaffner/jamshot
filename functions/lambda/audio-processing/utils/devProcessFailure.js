/**
 * Extract a human-readable error from lambda child process output.
 * Local runs log via pino to stdout and often leave stderr empty.
 */
export function extractProcessError(stdout = '', stderr = '') {
  const fromStderr = stderr.trim();
  if (fromStderr) return fromStderr;

  const text = String(stdout || '');

  // Prefer structured pino / logger lines with an error field
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('{')) continue;
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed.error && typeof parsed.error === 'string') {
        return parsed.error;
      }
      if (parsed.message === 'Error during audio processing' && parsed.error) {
        return String(parsed.error);
      }
    } catch {
      // not JSON
    }
  }

  // Local runner prints: Local execution completed: { statusCode: 500, body: '...' }
  const bodyMatch = text.match(/"error":"((?:\\.|[^"\\])*)"/);
  if (bodyMatch?.[1]) {
    try {
      return JSON.parse(`"${bodyMatch[1]}"`);
    } catch {
      return bodyMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"');
    }
  }

  const trimmedStdout = text.trim();
  return trimmedStdout || 'Processing failed';
}

export function logProcessFailure({ label, code, stdout, stderr }) {
  console.error(`❌ Failed to process ${label}`);
  console.error('Exit code:', code);
  const out = String(stdout || '').trim();
  const err = String(stderr || '').trim();
  if (out) console.error('Output:', out);
  if (err) console.error('Error:', err);
  if (!out && !err) {
    console.error('No stdout/stderr captured from process');
  }
  return extractProcessError(stdout, stderr);
}
