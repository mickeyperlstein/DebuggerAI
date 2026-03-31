/**
 * demo.ts — fixed HTTP client for the multi-session debug demo.
 *
 * Same as client.ts but sends the object WITH token added.
 * The server receives a valid token and processes successfully.
 *
 * Run with: npm run demo:fixed  (expected: server responds 200 OK)
 */

import * as http from 'http';

const PORT = process.env.SERVER_PORT ? parseInt(process.env.SERVER_PORT, 10) : 3742;

function get(path: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    http.get({ host: 'localhost', port: PORT, path }, res => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => resolve(JSON.parse(data)));
    }).on('error', reject);
  });
}

function post(path: string, body: unknown): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const req = http.request(
      { host: 'localhost', port: PORT, path, method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } },
      res => {
        let data = '';
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => resolve(JSON.parse(data)));
      }
    );
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

async function main(): Promise<void> {
  const obj = await get('/object') as Record<string, unknown>;

  // FIX applied: token is included — server processes successfully
  const enriched = { ...obj, token: 'client-token-xyz' };

  const result = await post('/exchange', enriched);
  process.stdout.write(JSON.stringify(result) + '\n');
}

main().catch(err => {
  process.stderr.write(String(err) + '\n');
  process.exit(1);
});
