/**
 * server.ts — simple HTTP server for the multi-session debug demo.
 *
 * Demonstrates a real crash when the client sends an object missing `token`.
 * Used by: multi-session.test.ts (bug + fixed scenarios) and npm run demo / demo:fixed.
 *
 * GET  /object   → returns { id: 1, data: "hello", token: null }
 * POST /exchange → reads body, does token.toUpperCase() (crashes if null/missing)
 *                → logs "TOKEN FIXED: " + token if it works
 */

import * as http from 'http';

// Shared object created at startup
const obj: { id: number; data: string; token: string | null } = {
  id: 1,
  data: 'hello',
  token: null,
};

const PORT = process.env.SERVER_PORT ? parseInt(process.env.SERVER_PORT, 10) : 3742;

const server = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/object') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(obj));
    return;
  }

  if (req.method === 'POST' && req.url === '/exchange') {
    let rawBody = '';
    req.on('data', chunk => { rawBody += chunk; });
    req.on('end', () => {
      const body = JSON.parse(rawBody) as typeof obj;

      // BREAKPOINT: inspect incoming object
      const token = body.token;
      const upper = token!.toUpperCase(); // crashes if token is null/missing

      console.log('TOKEN FIXED:', token);
      obj.token = upper;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, stored: upper }));
    });
    return;
  }

  res.writeHead(404);
  res.end();
});

server.listen(PORT, () => {
  process.stdout.write(`server listening on ${PORT}\n`);
});
