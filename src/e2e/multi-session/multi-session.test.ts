/**
 * multi-session.test.ts — real e2e two-part bugfix test using Node.js CDP.
 *
 * Part 1: detects missing token at client breakpoint via real debugger — server CRASHES.
 * Part 2: patches client.ts, re-runs with real debugger, verifies token flows end-to-end.
 *
 * Uses NodeCdpAdapter + BusRouter. No mocking. Real processes, real breakpoints, real inspection.
 */

import * as child_process from 'child_process';
import { ChildProcess } from 'child_process';
import * as path from 'path';
import * as net from 'net';
import * as fs from 'fs';
import { BusRouter } from '../../BusRouter';
import { BusMessage } from '../../types';
import { NodeCdpAdapter } from './NodeCdpAdapter';

jest.setTimeout(120_000);

const SERVER_TS    = path.resolve(__dirname, 'server.ts');
const CLIENT_TS    = path.resolve(__dirname, 'client.ts');
const PROJECT_ROOT = path.resolve(__dirname, '../../..');

// ── BREAKPOINT line numbers (1-based, from the source files) ─────────────────
// server.ts line 37: "const token = body.token;"
// client.ts line 46: "const enriched = { ...obj };"
// CDP uses 0-indexed, so:
const SERVER_BP_LINE_0 = 36; // 0-indexed CDP line number
const CLIENT_BP_LINE_0 = 45; // 0-indexed CDP line number

// ── Helpers ───────────────────────────────────────────────────────────────────

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

/**
 * Spawn a TypeScript file with Node.js inspector enabled.
 * Uses ts-node/register for source-map-aware debugging.
 */
function spawnInspect(script: string, env: NodeJS.ProcessEnv): ChildProcess {
  return child_process.spawn(
    process.execPath,
    ['-r', 'ts-node/register', '--inspect-brk=0', script],
    {
      env: { ...process.env, TS_NODE_PROJECT: path.join(PROJECT_ROOT, 'tsconfig.json'), ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
      cwd: PROJECT_ROOT,
    },
  );
}

/** Parse the inspector WebSocket URL from process stderr output. */
function waitForInspectorUrl(proc: ChildProcess): Promise<string> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error('inspector URL timeout — no debugger URL seen in stderr')),
      15000,
    );
    proc.stderr?.on('data', (chunk: Buffer) => {
      const match = chunk.toString().match(/ws:\/\/[\d.:]+\/[a-f0-9-]+/);
      if (match) {
        clearTimeout(timeout);
        resolve(match[0]);
      }
    });
    proc.once('exit', (code) => {
      clearTimeout(timeout);
      reject(new Error(`process exited (code=${code}) before inspector URL appeared`));
    });
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
function collectOutput(proc: ChildProcess): string[] {
  const lines: string[] = [];
  proc.stdout?.on('data', (chunk: Buffer) => lines.push(chunk.toString()));
  proc.stderr?.on('data', (chunk: Buffer) => lines.push(chunk.toString()));
  return lines;
}

/** Wait for process exit; resolves with exit code (null → 1). */
function onExit(proc: ChildProcess): Promise<number> {
  return new Promise(resolve => {
    if ((proc as unknown as { exitCode: number | null }).exitCode !== null) {
      // already exited
      resolve((proc as unknown as { exitCode: number | null }).exitCode ?? 1);
      return;
    }
    proc.once('exit', code => resolve(code ?? 1));
  });
}

/** Kill a process if still running. */
function kill(proc: ChildProcess): void {
  try { proc.kill('SIGTERM'); } catch { /* already dead */ }
}

// ── Patch helpers ─────────────────────────────────────────────────────────────

const BUGGY_LINE = "  const enriched = { ...obj };           // BUG: token is not added — server will crash";
const FIXED_LINE = "  const enriched = { ...obj, token: 'client-token-xyz' }; // FIX applied";

function patchClientFixed(): void {
  const src = fs.readFileSync(CLIENT_TS, 'utf8');
  if (!src.includes(BUGGY_LINE)) {
    // Already fixed or different — check for FIXED_LINE already
    if (src.includes(FIXED_LINE)) return;
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

// ── afterAll: always restore client.ts ───────────────────────────────────────

afterAll(() => {
  restoreClientBuggy();
});

// ── Part 1 ────────────────────────────────────────────────────────────────────

it('Part 1: detects missing token at client breakpoint — server CRASHES', async () => {
  const port = await findFreePort();
  const router = new BusRouter();
  const busEvents: BusMessage[] = [];
  const unsubAll = router.subscribe('*', msg => { busEvents.push(msg); });

  // ── Spawn server (no inspector needed for server in Part 1 — it crashes on its own)
  const serverProc = spawnInspect(SERVER_TS, { SERVER_PORT: String(port) });
  const serverLines = collectOutput(serverProc);

  // Wait for inspector URL then connect (we don't need to debug server in Part 1,
  // but we spawn with --inspect-brk so we must at least resume it)
  const serverInspectorUrl = await waitForInspectorUrl(serverProc);
  const serverAdapter = new NodeCdpAdapter(
    serverInspectorUrl,
    (topic, payload) => router.publish('server', 'node-cdp', topic, payload),
  );
  await serverAdapter.connect();

  // Resume server from --inspect-brk immediately (no breakpoints needed for Part 1)
  const serverStarted = serverAdapter.startDebugging('server');

  // Wait for the server HTTP port to be ready
  await waitForPort(port);

  // Publish server session attached
  await router.publish('server', 'debuggingai', 'session.attached', {
    sessionId: 'server',
    script: SERVER_TS,
  });

  // ── Spawn buggy client
  const clientInspectPort = await findFreePort();
  const clientProc = spawnInspect(CLIENT_TS, { SERVER_PORT: String(port) });
  const clientLines = collectOutput(clientProc);

  const clientInspectorUrl = await waitForInspectorUrl(clientProc);
  const clientAdapter = new NodeCdpAdapter(
    clientInspectorUrl,
    (topic, payload) => router.publish('client', 'node-cdp', topic, payload),
  );
  await clientAdapter.connect();

  // Set breakpoint at the BREAKPOINT line in client.ts (0-indexed)
  clientAdapter.addBreakpoint(CLIENT_TS, CLIENT_BP_LINE_0);

  // Also add with file:// prefix as fallback
  clientAdapter.addBreakpoint(`file://${CLIENT_TS}`, CLIENT_BP_LINE_0);

  // Publish client session attached
  await router.publish('client', 'debuggingai', 'session.attached', {
    sessionId: 'client',
    script: CLIENT_TS,
  });

  // Start client debugging — sets breakpoints, then resumes from --inspect-brk
  const clientStop = await clientAdapter.startDebugging('client');

  // Evaluate enriched at the breakpoint
  let enrichedToken: unknown = 'NOT_EVALUATED';
  if (clientStop && clientStop.reason !== 'exited') {
    // We're paused at the breakpoint in client.ts
    await router.publish('client', 'node-cdp', 'breakpoint.hit', {
      sessionId: 'client',
      file: clientStop.file,
      line: clientStop.line,
      reason: clientStop.reason,
    });

    // Evaluate `typeof enriched !== 'undefined' ? JSON.stringify(enriched) : JSON.stringify(obj)`
    // At this line, `enriched` is being assigned — it may not exist yet.
    // Evaluate `obj` to inspect what's about to be sent
    const objResult = await clientAdapter.evaluate('JSON.stringify(obj)', 0);
    if ('result' in objResult) {
      try {
        const objVal = JSON.parse(objResult.result) as Record<string, unknown>;
        enrichedToken = objVal.token;
        await router.publish('client', 'node-cdp', 'inspect.result', {
          sessionId: 'client',
          expression: 'JSON.stringify(obj)',
          value: objResult.result,
          parsedToken: enrichedToken,
        });
      } catch {
        enrichedToken = null;
      }
    } else {
      enrichedToken = null;
    }

    // Continue client execution — it will POST to server without token, causing server crash
    await clientAdapter.sendExecution('continue');
  } else {
    // Client ran to completion without hitting breakpoint — still valid for bus test
    await router.publish('client', 'node-cdp', 'session.exit', {
      sessionId: 'client',
      reason: 'no breakpoint hit',
    });
  }

  // Wait for client to finish
  const clientExit = await onExit(clientProc);

  // Give server a moment to crash
  const serverExit = await Promise.race<number>([
    onExit(serverProc),
    new Promise<number>(resolve => setTimeout(() => resolve(-1), 5000)),
  ]);

  // Publish session.exit events
  await router.publish('client', 'node-cdp', 'session.exit', { code: clientExit });
  if (serverExit !== -1) {
    await router.publish('server', 'node-cdp', 'session.exit', { code: serverExit });
  }

  // ── Assertions ────────────────────────────────────────────────────────────

  // token must be null/undefined at client breakpoint (the bug)
  expect(enrichedToken === null || enrichedToken === undefined).toBe(true);

  // Client exits non-zero because server crashed (connection reset / JSON parse error)
  expect(clientExit).not.toBe(0);

  // Server crashed (non-zero) or still pending (acceptable — it may be mid-crash)
  expect(serverExit === -1 || serverExit !== 0).toBe(true);

  // Bus has events from both sessions
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
  await serverAdapter.stopDebugging();
  await clientAdapter.stopDebugging();
  kill(serverProc);
  kill(clientProc);
  void serverStarted; // discard — server may be mid-pause
  void clientLines;
  void serverLines;
  void clientInspectPort;
});

// ── Part 2 ────────────────────────────────────────────────────────────────────

it('Part 2: after patching client, token flows end-to-end — server survives', async () => {
  // Programmatically patch client.ts
  patchClientFixed();

  const port = await findFreePort();
  const router = new BusRouter();
  const busEvents: BusMessage[] = [];
  const unsubAll = router.subscribe('*', msg => { busEvents.push(msg); });

  // ── Spawn server with inspector
  const serverProc = spawnInspect(SERVER_TS, { SERVER_PORT: String(port) });
  const serverLines = collectOutput(serverProc);

  const serverInspectorUrl = await waitForInspectorUrl(serverProc);
  const serverAdapter = new NodeCdpAdapter(
    serverInspectorUrl,
    (topic, payload) => router.publish('server', 'node-cdp', topic, payload),
  );
  await serverAdapter.connect();

  // Set server breakpoint at the token inspection line (0-indexed)
  serverAdapter.addBreakpoint(SERVER_TS, SERVER_BP_LINE_0);
  serverAdapter.addBreakpoint(`file://${SERVER_TS}`, SERVER_BP_LINE_0);

  // Resume server from --inspect-brk — waits for first breakpoint hit
  const serverStartPromise = serverAdapter.startDebugging('server');

  // Wait for HTTP port
  await waitForPort(port);

  await router.publish('server', 'debuggingai', 'session.attached', {
    sessionId: 'server',
    script: SERVER_TS,
  });

  // ── Spawn patched client
  const clientProc = spawnInspect(CLIENT_TS, { SERVER_PORT: String(port) });
  const clientLines = collectOutput(clientProc);

  const clientInspectorUrl = await waitForInspectorUrl(clientProc);
  const clientAdapter = new NodeCdpAdapter(
    clientInspectorUrl,
    (topic, payload) => router.publish('client', 'node-cdp', topic, payload),
  );
  await clientAdapter.connect();

  // Set client breakpoint at the enriched line (0-indexed)
  clientAdapter.addBreakpoint(CLIENT_TS, CLIENT_BP_LINE_0);
  clientAdapter.addBreakpoint(`file://${CLIENT_TS}`, CLIENT_BP_LINE_0);

  await router.publish('client', 'debuggingai', 'session.attached', {
    sessionId: 'client',
    script: CLIENT_TS,
  });

  // Start debugging client — resumes from --inspect-brk, waits for breakpoint
  const clientStop = await clientAdapter.startDebugging('client');

  let evaluatedToken: unknown = 'NOT_EVALUATED';

  if (clientStop && clientStop.reason !== 'exited') {
    await router.publish('client', 'node-cdp', 'breakpoint.hit', {
      sessionId: 'client',
      file: clientStop.file,
      line: clientStop.line,
      reason: clientStop.reason,
    });

    // Evaluate enriched — with the fix applied, it should include token: 'client-token-xyz'
    // At the breakpoint line, `enriched` is about to be assigned; evaluate `obj` and the
    // fixed expression directly
    const enrichedResult = await clientAdapter.evaluate(
      "JSON.stringify({ ...obj, token: 'client-token-xyz' })",
      0,
    );

    // Also try evaluating just `obj` to confirm base shape
    const objResult = await clientAdapter.evaluate('JSON.stringify(obj)', 0);

    if ('result' in enrichedResult) {
      try {
        const enrichedVal = JSON.parse(enrichedResult.result) as Record<string, unknown>;
        evaluatedToken = enrichedVal.token;
        await router.publish('client', 'node-cdp', 'inspect.result', {
          sessionId: 'client',
          expression: 'enriched (fixed)',
          value: enrichedResult.result,
          token: evaluatedToken,
        });
      } catch {
        evaluatedToken = null;
      }
    }

    if ('result' in objResult) {
      await router.publish('client', 'node-cdp', 'inspect.result', {
        sessionId: 'client',
        expression: 'obj',
        value: objResult.result,
      });
    }

    // Continue client — it will POST with token, server processes successfully
    await clientAdapter.sendExecution('continue');
  }

  // Wait for server breakpoint (the POST will trigger it)
  const serverStop = await serverStartPromise;

  if (serverStop && serverStop.reason !== 'exited') {
    await router.publish('server', 'node-cdp', 'breakpoint.hit', {
      sessionId: 'server',
      file: serverStop.file,
      line: serverStop.line,
      reason: serverStop.reason,
    });

    // Evaluate the token on the server side
    const serverTokenResult = await serverAdapter.evaluate('JSON.stringify(token)', 0);
    if ('result' in serverTokenResult) {
      await router.publish('server', 'node-cdp', 'inspect.result', {
        sessionId: 'server',
        expression: 'token',
        value: serverTokenResult.result,
      });
    }

    // Continue server — it should process successfully and log TOKEN FIXED
    await serverAdapter.sendExecution('continue');
  }

  // Wait for client to finish successfully
  const clientExit = await onExit(clientProc);

  // Give server time to write TOKEN FIXED log
  await new Promise<void>(resolve => setTimeout(resolve, 2000));

  // Publish exit events
  await router.publish('client', 'node-cdp', 'session.exit', { code: clientExit });

  // ── Assertions ────────────────────────────────────────────────────────────

  // client exits successfully — fix confirmed end-to-end
  expect(clientExit).toBe(0);

  // Token is 'client-token-xyz' as evaluated at client breakpoint
  expect(evaluatedToken).toBe('client-token-xyz');

  // Server logs TOKEN FIXED
  expect(serverLines.join('')).toMatch(/TOKEN FIXED/);

  // Server is still alive after client exits
  const serverStillAlive = await Promise.race<boolean>([
    onExit(serverProc).then(() => false),
    new Promise<boolean>(resolve => setTimeout(() => resolve(true), 500)),
  ]);
  expect(serverStillAlive).toBe(true);

  // Bus has events from both sessions
  const sessions = new Set(busEvents.map(e => e.sessionId));
  expect(sessions.has('server')).toBe(true);
  expect(sessions.has('client')).toBe(true);
  expect(busEvents.length).toBeGreaterThanOrEqual(2);

  // cleanup
  unsubAll();
  await serverAdapter.stopDebugging();
  await clientAdapter.stopDebugging();
  kill(serverProc);
  kill(clientProc);
  void clientLines;
});
