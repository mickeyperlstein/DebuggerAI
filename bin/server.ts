/**
 * Standalone DebuggingAI server.
 *
 * WHAT: Starts the HTTP + WebSocket server as a plain Node.js process.
 *       No VS Code required — connects via WebSocket to the VS Code extension
 *       (or any other debug client) that registers on /__ws.
 *
 * WHY:  The server is now IDE-agnostic. It can run:
 *         - On the developer's machine (same host as VS Code)
 *         - Inside a Docker container alongside a language SDK
 *         - As an MCP server consumed by an AI agent
 *       The VS Code extension (or a future Docker debug client) connects
 *       as a WebSocket client and handles the actual debug adapter calls.
 *
 * USAGE:
 *   node out/bin/server.js              # default port 7890
 *   DEBUGAI_PORT=9000 node out/bin/server.js
 */

import { BreakpointManager } from '../src/breakpoints';
import { SessionManager }    from '../src/session';
import { ClientAdapter }     from '../src/server/ClientAdapter';
import { ClientRegistry }    from '../src/server/ClientRegistry';
import { Server }            from '../src/server';

const port     = Number(process.env.DEBUGAI_PORT ?? 7890);
const registry = new ClientRegistry();
const adapter  = new ClientAdapter(registry);
const mgr      = new BreakpointManager(adapter);
const sm       = new SessionManager(adapter);
const server   = new Server(mgr, sm, port, registry);

server.start().then(() => {
  process.stdout.write(`DebuggingAI server listening on port ${port}\n`);
  process.stdout.write(`WebSocket client endpoint: ws://127.0.0.1:${port}/__ws\n`);
}).catch((e: Error) => {
  process.stderr.write(`Failed to start: ${e.message}\n`);
  process.exit(1);
});

process.on('SIGINT',  () => server.stop().then(() => process.exit(0)));
process.on('SIGTERM', () => server.stop().then(() => process.exit(0)));
