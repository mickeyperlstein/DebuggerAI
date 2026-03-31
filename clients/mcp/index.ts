#!/usr/bin/env node
/**
 * clients/mcp/index.ts — DebuggingAI MCP server.
 *
 * WHAT: Exposes every DebuggingAI HTTP command as an MCP tool so any
 *       MCP-capable AI agent (Claude Desktop, Cline, etc.) can drive a
 *       live debug session without knowing the HTTP API.
 *
 * WHY:  The HTTP server requires a raw POST with a JSON body. MCP gives
 *       AI agents a structured, self-describing tool interface with typed
 *       inputs — no curl, no JSON wrangling, no documentation needed.
 *
 * WHEN: Run as a standalone process. Add to claude_desktop_config.json:
 *       {
 *         "mcpServers": {
 *           "debuggingai": {
 *             "command": "node",
 *             "args": ["/path/to/out/clients/mcp/index.js"]
 *           }
 *         }
 *       }
 *
 * USAGE:
 *   node out/clients/mcp/index.js              # default port 7890
 *   DEBUGAI_PORT=9000 node out/clients/mcp/index.js
 */

import http from 'http';
import { Server }               from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { version: VERSION } = require('../../../package.json') as { version: string };

const PORT = Number(process.env.DEBUGAI_PORT ?? 7890);
const HOST = process.env.DEBUGAI_HOST ?? '127.0.0.1';

// ── HTTP helper ──────────────────────────────────────────────────────────────

function call(command: string, params: Record<string, unknown> = {}): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ command, ...params });
    const req  = http.request(
      { hostname: HOST, port: PORT, path: '/', method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } },
      res => {
        let raw = '';
        res.on('data', c => (raw += c));
        res.on('end', () => {
          try { resolve(JSON.parse(raw)); }
          catch { reject(new Error('Invalid JSON from DebuggingAI server')); }
        });
      },
    );
    req.on('error', e => reject(new Error(`Cannot reach DebuggingAI server on port ${PORT}: ${e.message}`)));
    req.write(body);
    req.end();
  });
}

// ── Tool definitions ─────────────────────────────────────────────────────────

const TOOLS: Tool[] = [
  // ── Breakpoints ────────────────────────────────────────────────────────────
  {
    name: 'set_breakpoint',
    description: 'Set a breakpoint at a specific file and line. Can be called before or during a session — breakpoints persist and activate automatically when a session starts. Optionally add a condition.',
    inputSchema: {
      type: 'object',
      properties: {
        file:      { type: 'string', description: 'Absolute path to the source file' },
        line:      { type: 'number', description: 'Line number (1-based)' },
        condition: { type: 'string', description: 'Optional condition expression (e.g. "x > 5")' },
      },
      required: ['file', 'line'],
    },
  },
  {
    name: 'list_breakpoints',
    description: 'List all currently set breakpoints, including those set before any session started.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'clear_breakpoint',
    description: 'Remove a breakpoint by its ID. Works whether or not a session is active.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', description: 'Breakpoint ID from list_breakpoints' } },
      required: ['id'],
    },
  },
  {
    name: 'clear_all_breakpoints',
    description: 'Remove all breakpoints. Works whether or not a session is active.',
    inputSchema: { type: 'object', properties: {} },
  },
  // ── Session ────────────────────────────────────────────────────────────────
  {
    name: 'start_session',
    description: 'Start a debug session for runtime control (continue, step, inspect). Pre-set breakpoints and watches activate automatically.',
    inputSchema: {
      type: 'object',
      properties: { config: { type: 'string', description: 'Name of the launch.json debug configuration' } },
      required: ['config'],
    },
  },
  {
    name: 'stop_session',
    description: 'Stop the active debug session.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'restart_session',
    description: 'Restart the active debug session.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'session_status',
    description: 'Get the current debug session status. States: idle (no session), running (executing), paused (at breakpoint or step), exited (session ended).',
    inputSchema: { type: 'object', properties: {} },
  },
  // ── Execution ──────────────────────────────────────────────────────────────
  {
    name: 'continue',
    description: 'Resume execution until the next breakpoint.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'next',
    description: 'Step over — advance one line without entering function calls.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'step',
    description: 'Step into — advance one line, entering function calls.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'step_out',
    description: 'Step out — run until the current function returns.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'run_until',
    description: 'Run until a specific line number in the current file.',
    inputSchema: {
      type: 'object',
      properties: { line: { type: 'number', description: 'Target line number' } },
      required: ['line'],
    },
  },
  {
    name: 'jump_to',
    description: 'Jump execution to a specific line (does not execute skipped lines).',
    inputSchema: {
      type: 'object',
      properties: { line: { type: 'number', description: 'Target line number' } },
      required: ['line'],
    },
  },
  // ── Inspection ─────────────────────────────────────────────────────────────
  {
    name: 'print',
    description: 'Evaluate and print the value of one or more expressions in the current frame. ' +
      'Accepts a single expression string or an array of variable/expression names. ' +
      'Always returns an array of { name, value } objects — single expressions return an array of length 1.',
    inputSchema: {
      type: 'object',
      properties: {
        expression: {
          oneOf: [
            { type: 'string', description: 'Single expression to evaluate (e.g. "a + b")' },
            { type: 'array', items: { type: 'string' }, description: 'Array of expressions to evaluate' },
          ],
          description: 'Expression or array of expressions to evaluate',
        },
      },
      required: ['expression'],
    },
  },
  {
    name: 'whatis',
    description: 'Show the type of an expression.',
    inputSchema: {
      type: 'object',
      properties: { expression: { type: 'string', description: 'Expression to inspect' } },
      required: ['expression'],
    },
  },
  {
    name: 'exec',
    description: 'Execute a statement in the current frame (e.g. assign a variable).',
    inputSchema: {
      type: 'object',
      properties: { expression: { type: 'string', description: 'Statement to execute' } },
      required: ['expression'],
    },
  },
  {
    name: 'watch',
    description: 'Register an expression to watch (displayed on every stop). Can be set before or during a session — watches activate automatically when a session starts.',
    inputSchema: {
      type: 'object',
      properties: { expression: { type: 'string', description: 'Expression to watch' } },
      required: ['expression'],
    },
  },
  {
    name: 'unwatch',
    description: 'Remove a watched expression. Works whether or not a session is active. Omit expression to clear all watches.',
    inputSchema: {
      type: 'object',
      properties: { expression: { type: 'string', description: 'Expression to remove (omit to clear all)' } },
    },
  },
  {
    name: 'show_args',
    description: 'Show the arguments of the current function frame.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'show_return_value',
    description: 'Show the return value of the last function call.',
    inputSchema: { type: 'object', properties: {} },
  },
];

// ── Tool dispatch ────────────────────────────────────────────────────────────

async function dispatch(name: string, args: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    case 'set_breakpoint':       return call('set',         { file: args.file, line: args.line, condition: args.condition ?? null });
    case 'list_breakpoints':     return call('list');
    case 'clear_breakpoint':     return call('clear',       { id: args.id });
    case 'clear_all_breakpoints':return call('clearAll');
    case 'start_session':        return call('start',       { config: args.config });
    case 'stop_session':         return call('quit');
    case 'restart_session':      return call('restart');
    case 'session_status':       return call('status');
    case 'continue':             return call('continue');
    case 'next':                 return call('next');
    case 'step':                 return call('step');
    case 'step_out':             return call('return');
    case 'run_until':            return call('until',       { line: args.line });
    case 'jump_to':              return call('jump',        { line: args.line });
    case 'print': {
      // Array-first value protocol: accept string or string[]. Always return { name, value }[].
      const expressions = Array.isArray(args.expression)
        ? (args.expression as string[])
        : [args.expression as string];
      const results = await Promise.all(
        expressions.map(async expr => {
          const r = await call('print', { expression: expr }) as { ok: boolean; valueRepr?: string; error?: string };
          return { name: expr, value: r.ok ? (r.valueRepr ?? null) : null, error: r.ok ? undefined : r.error };
        }),
      );
      return results;
    }
    case 'whatis':               return call('whatis',      { expression: args.expression });
    case 'exec':                 return call('exec',        { expression: args.expression });
    case 'watch':                return call('display',     { expression: args.expression });
    case 'unwatch':              return call('undisplay',   { expression: args.expression });
    case 'show_args':            return call('args');
    case 'show_return_value':    return call('retval');
    default: throw new Error(`Unknown tool: ${name}`);
  }
}

// ── MCP server ───────────────────────────────────────────────────────────────

const server = new Server(
  {
    name: 'debuggingai',
    version: VERSION,
    description: 'Breakpoint and watch tools work independently of session state — call them any time. Session tools (start, stop, restart, continue, step, etc.) require an active session.',
  },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async req => {
  const result = await dispatch(req.params.name, (req.params.arguments ?? {}) as Record<string, unknown>);
  return {
    content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
  };
});

const transport = new StdioServerTransport();
server.connect(transport).catch((err: Error) => {
  process.stderr.write(`MCP server error: ${err.message}\n`);
  process.exit(1);
});
