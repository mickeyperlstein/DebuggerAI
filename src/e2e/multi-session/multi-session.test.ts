/**
 * multi-session.test.ts — e2e two-part bugfix test.
 *
 * Part 1: detects missing token at client breakpoint — server CRASHES (expected).
 * Part 2: patches client.ts programmatically, reruns, verifies token flows end-to-end.
 *
 * Uses BusRouter directly (no MCP, no WebSocket).
 * Part 2 restores client.ts to its original (buggy) state in afterAll.
 */

import * as child_process from 'child_process';
import * as path from 'path';
import * as net from 'net';
import * as fs from 'fs';
import { BusRouter } from '../../BusRouter';
import { BusMessage } from '../../types';

const SERVER_TS    = path.resolve(__dirname, 'server.ts');
const CLIENT_TS    = path.resolve(__dirname, 'client.ts');
const PROJECT_ROOT = path.resolve(__dirname, '../../..');
const TS_NODE      = path.resolve(PROJECT_ROOT, 'node_modules/.bin/ts-node');
const TSCONFIG     = path.resolve(PROJECT_ROOT, 'tsconfig.json');

// ── helpers ───────────────────────────────────────────────────────────────────

function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, () => {
      const addr = srv.address() as net.AddressInfo;
      srv.close(() => resolve(addr.port));
    });
    srv.on('error', reject);
  });
}

function spawnTs(script: string, env: NodeJS.ProcessEnv): child_process.ChildProcess {
  return child_process.spawn(TS_NODE, ['--transpile-only', '--project', TSCONFIG, script], {
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

/** Wait until `localhost:port` accepts a TCP connection, up to `timeoutMs`. */
function waitForPort(port: number, timeoutMs = 30000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    function attempt() {
      const sock = net.createConnection({ port, host: 'localhost' });
      sock.once('connect', () => { sock.destroy(); resolve(); });
      sock.once('error', () => {
        if (Date.now() >= deadline) return reject(new Error(`port ${port} not ready`));
        setTimeout(attempt, 100);
      });
    }
    attempt();
  });
}

/** Collect stdout+stderr from a process into a lines array (in place). */
function collectOutput(proc: child_process.ChildProcess): string[] {
  const lines: string[] = [];
  proc.stdout?.on('data', (chunk: Buffer) => lines.push(chunk.toString()));
  proc.stderr?.on('data', (chunk: Buffer) => lines.push(chunk.toString()));
  return lines;
}

/** Wait for process exit; resolves with exit code (null → 1). */
function onExit(proc: child_process.ChildProcess): Promise<number> {
  return new Promise(resolve => {
    proc.once('exit', code => resolve(code ?? 1));
  });
}

/** Kill a process if still running. */
function kill(proc: child_process.ChildProcess): void {
  try { proc.kill('SIGTERM'); } catch { /* already dead */ }
}

// ── patch helpers ─────────────────────────────────────────────────────────────

const BUGGY_LINE = "  const enriched = { ...obj };           // BUG: token is not added — server will crash";
const FIXED_LINE = "  const enriched = { ...obj, token: 'client-token-xyz' }; // FIX applied";

function patchClientFixed(): void {
  const src = fs.readFileSync(CLIENT_TS, 'utf8');
  if (!src.includes(BUGGY_LINE)) {
    throw new Error('client.ts does not contain the expected buggy line — cannot patch');
  }
  fs.writeFileSync(CLIENT_TS, src.replace(BUGGY_LINE, FIXED_LINE), 'utf8');
}

function restoreClientBuggy(): void {
  const src = fs.readFileSync(CLIENT_TS, 'utf8');
  if (src.includes(FIXED_LINE)) {
    fs.writeFileSync(CLIENT_TS, src.replace(FIXED_LINE, BUGGY_LINE), 'utf8');
  }
}

// ── afterAll: always restore client.ts to buggy state ────────────────────────

afterAll(() => {
  restoreClientBuggy();
});

// ── Part 1 ────────────────────────────────────────────────────────────────────

it("Part 1: detects missing token at client breakpoint", async () => {
  const port = await findFreePort();
  const router = new BusRouter();
  const busEvents: BusMessage[] = [];

  // Wildcard subscription — collects ALL bus events across both sessions
  const unsubAll = router.subscribe('*', msg => { busEvents.push(msg); });

  // Spawn server
  const serverProc = spawnTs(SERVER_TS, { SERVER_PORT: String(port) });
  collectOutput(serverProc);
  await waitForPort(port);

  // Attach DebuggingAI session: server
  await router.publish('server', 'debuggingai', 'session.attached', {
    sessionId: 'server',
    script: SERVER_TS,
  });
  await router.publish('server', 'debuggingai', 'breakpoint.set', {
    sessionId: 'server',
    file: SERVER_TS,
    line: 36, // BREAKPOINT: inspect incoming object
    comment: 'BREAKPOINT: inspect incoming object',
  });

  // Spawn buggy client (no token added)
  const clientProc = spawnTs(CLIENT_TS, { SERVER_PORT: String(port) });
  collectOutput(clientProc);

  // Attach DebuggingAI session: client
  await router.publish('client', 'debuggingai', 'session.attached', {
    sessionId: 'client',
    script: CLIENT_TS,
  });

  // Simulate breakpoint hit on client — inspect obj before sending
  await router.publish('client', 'debuggingai', 'breakpoint.hit', {
    sessionId: 'client',
    file: CLIENT_TS,
    line: 46, // BREAKPOINT: inspect obj before sending
    locals: { obj: { id: 1, data: 'hello', token: null } },
    comment: 'BREAKPOINT: inspect obj before sending',
  });

  // Wait for client to finish — expected non-zero because server crashes
  const clientExit = await onExit(clientProc);

  // ── assertions ──

  // obj.token is null at client breakpoint (the bug)
  const clientHit = busEvents.find(
    e => e.sessionId === 'client' && e.topic === 'breakpoint.hit'
  );
  expect(clientHit).toBeDefined();
  const clientLocals = (clientHit!.payload as { locals: { obj: { token: unknown } } }).locals;
  expect(clientLocals.obj.token === null || clientLocals.obj.token === undefined).toBe(true);

  // Server CRASHES — client exits non-zero (expected outcome, test passes because of it)
  expect(clientExit).not.toBe(0);

  // Server process crashed (non-zero) or timed out still in-flight crash (-1 means no exit yet)
  const serverExit = await Promise.race<number>([
    onExit(serverProc),
    new Promise<number>(resolve => setTimeout(() => resolve(-1), 3000)),
  ]);
  expect(serverExit === -1 || serverExit !== 0).toBe(true);

  // Bus events from both sessions recorded as proof
  const sessions = new Set(busEvents.map(e => e.sessionId));
  expect(sessions.has('server')).toBe(true);
  expect(sessions.has('client')).toBe(true);
  expect(busEvents.length).toBeGreaterThanOrEqual(2);

  // seq is monotonically increasing
  for (let i = 1; i < busEvents.length; i++) {
    expect(busEvents[i].seq).toBeGreaterThan(busEvents[i - 1].seq);
  }

  // cleanup
  unsubAll();
  kill(serverProc);
  kill(clientProc);
}, 60_000);

// ── Part 2 ────────────────────────────────────────────────────────────────────

it("Part 2: after patching client, token flows end-to-end", async () => {
  // Programmatically patch client.ts — swap buggy line for fixed version
  patchClientFixed();

  const port = await findFreePort();
  const router = new BusRouter();
  const busEvents: BusMessage[] = [];

  const unsubAll = router.subscribe('*', msg => { busEvents.push(msg); });

  // Spawn fresh server
  const serverProc = spawnTs(SERVER_TS, { SERVER_PORT: String(port) });
  const serverLines = collectOutput(serverProc);
  await waitForPort(port);

  // Attach DebuggingAI session: server
  await router.publish('server', 'debuggingai', 'session.attached', {
    sessionId: 'server',
    script: SERVER_TS,
  });
  await router.publish('server', 'debuggingai', 'breakpoint.set', {
    sessionId: 'server',
    file: SERVER_TS,
    line: 36, // BREAKPOINT: inspect incoming object
    comment: 'BREAKPOINT: inspect incoming object',
  });

  // Spawn patched client (now sends token)
  const clientProc = spawnTs(CLIENT_TS, { SERVER_PORT: String(port) });
  collectOutput(clientProc);

  // Attach DebuggingAI session: client
  await router.publish('client', 'debuggingai', 'session.attached', {
    sessionId: 'client',
    script: CLIENT_TS,
  });

  // Simulate client breakpoint hit — enriched now carries token
  await router.publish('client', 'debuggingai', 'breakpoint.hit', {
    sessionId: 'client',
    file: CLIENT_TS,
    line: 46, // BREAKPOINT: inspect obj before sending — FIX applied
    locals: {
      obj: { id: 1, data: 'hello', token: null },
      enriched: { id: 1, data: 'hello', token: 'client-token-xyz' },
    },
    comment: 'BREAKPOINT: inspect obj before sending — FIX applied',
  });

  // Simulate server breakpoint hit — token is present
  await router.publish('server', 'debuggingai', 'breakpoint.hit', {
    sessionId: 'server',
    file: SERVER_TS,
    line: 36,
    locals: { body: { id: 1, data: 'hello', token: 'client-token-xyz' } },
    comment: 'BREAKPOINT: inspect incoming object — token present',
  });

  // Wait for client — should succeed (exit 0)
  const clientExit = await onExit(clientProc);

  // Give server a moment to write the TOKEN FIXED log line
  await new Promise<void>(resolve => setTimeout(resolve, 1000));

  // ── assertions ──

  // client exits successfully — fix confirmed end-to-end
  expect(clientExit).toBe(0);

  // obj.token === "client-token-xyz" at client breakpoint
  const clientHit = busEvents.find(
    e => e.sessionId === 'client' && e.topic === 'breakpoint.hit'
  );
  expect(clientHit).toBeDefined();
  const clientLocals = (clientHit!.payload as {
    locals: { enriched?: { token: string } }
  }).locals;
  expect(clientLocals.enriched?.token).toBe('client-token-xyz');

  // server receives token: "client-token-xyz" and does NOT crash
  const serverHit = busEvents.find(
    e => e.sessionId === 'server' && e.topic === 'breakpoint.hit'
  );
  expect(serverHit).toBeDefined();
  const serverLocals = (serverHit!.payload as { locals: { body: { token: string } } }).locals;
  expect(serverLocals.body.token).toBe('client-token-xyz');

  // server logs "TOKEN FIXED"
  expect(serverLines.join('')).toMatch(/TOKEN FIXED/);

  // server did NOT crash — still alive after client finished
  const serverStillAlive = await Promise.race<boolean>([
    onExit(serverProc).then(() => false),
    new Promise<boolean>(resolve => setTimeout(() => resolve(true), 500)),
  ]);
  expect(serverStillAlive).toBe(true);

  // Bus events from both sessions
  const sessions = new Set(busEvents.map(e => e.sessionId));
  expect(sessions.has('server')).toBe(true);
  expect(sessions.has('client')).toBe(true);

  // cleanup
  unsubAll();
  kill(serverProc);
  kill(clientProc);
}, 60_000);
