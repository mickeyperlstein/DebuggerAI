/**
 * demo_bug.js — DebuggingAI recording script (Node.js)
 *
 * Bug: baseHeaders is a shared object reference mutated inside the loop.
 * Every request config ends up with the same headers object — the last one wins.
 * Request IDs are wrong on all but the last request.
 */
function buildRequests(endpoints) {
  const baseHeaders = { 'Content-Type': 'application/json' };
  const configs = [];

  for (let i = 0; i < endpoints.length; i++) {
    const config = {
      url: endpoints[i],
      headers: baseHeaders,            // bug: shared reference, not a copy
    };
    config.headers['X-Request-Id'] = `req-${i + 1}`;
    configs.push(config);
  }

  return configs;
}

const configs = buildRequests([
  'https://api.example.com/users',
  'https://api.example.com/orders',
  'https://api.example.com/payments',
]);

console.log('Request 1 ID:', configs[0].headers['X-Request-Id']);  // should be req-1
console.log('Request 2 ID:', configs[1].headers['X-Request-Id']);  // should be req-2
console.log('Request 3 ID:', configs[2].headers['X-Request-Id']);  // should be req-3

if (configs[0].headers['X-Request-Id'] !== 'req-1') {
  throw new Error(`BUG: request 1 has ID "${configs[0].headers['X-Request-Id']}", expected "req-1"`);
}
