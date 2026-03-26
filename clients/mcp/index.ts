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
    description: 'Set a breakpoint at a specific file and line. Optionally add a condition.',
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
    description: 'List all currently set breakpoints.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'clear_breakpoint',
    description: 'Remove a breakpoint by its ID.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', description: 'Breakpoint ID from list_breakpoints' } },
      required: ['id'],
    },
  },
  {
    name: 'clear_all_breakpoints',
    description: 'Remove all breakpoints.',
    inputSchema: { type: 'object', properties: {} },
  },
  // ── Session ────────────────────────────────────────────────────────────────
  {
    name: 'start_session',
    description: 'Start a debug session using a named launch.json configuration.',
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
    description: 'Get the current debug session status (idle, running, paused).',
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
    description: 'Evaluate and print the value of an expression in the current frame.',
    inputSchema: {
      type: 'object',
      properties: { expression: { type: 'string', description: 'Expression to evaluate (e.g. "a + b")' } },
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
    description: 'Register an expression to watch (display on every stop).',
    inputSchema: {
      type: 'object',
      properties: { expression: { type: 'string', description: 'Expression to watch' } },
      required: ['expression'],
    },
  },
  {
    name: 'unwatch',
    description: 'Remove a watched expression. Omit expression to clear all watches.',
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
    case 'print':                return call('print',       { expression: args.expression });
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
  { name: 'debuggingai', version: '0.1.0' },
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
