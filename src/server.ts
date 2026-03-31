import * as http from 'http';
import { WebSocketServer } from 'ws';
import { BreakpointManager } from './breakpoints';
import { DebugStateMachine } from './session';
import { ApiRequest, BpResult, BpListResult } from './types';
import { SessionResult, StepResult, InspectResult } from './interfaces/IDebugger';
import { ClientRegistry } from './server/ClientRegistry';
import { log } from './log';

type Response = BpResult | BpListResult | SessionResult | StepResult | InspectResult;

/**
 * Thin HTTP server — localhost only.
 * Routing is a direct map from command string to manager method.
 * No switch, no duplication.
 */
export class Server {
  private readonly srv: http.Server;

  constructor(
    private readonly mgr: BreakpointManager,
    private readonly sm: DebugStateMachine,
    private readonly port: number,
    registry?: ClientRegistry,
    private readonly host: string = '127.0.0.1',
  ) {
    this.srv = http.createServer((req, res) => this.handle(req, res));

    // WHAT: Attach a WebSocket server to the same port as the HTTP API.
    // WHY:  The VS Code extension connects here as a thin client, streams debug
    //       events, and executes commands on behalf of the standalone server.
    //       Port sharing (HTTP + WS on 7890) keeps the setup to one process.
    // WHEN: Only wired when a ClientRegistry is provided (standalone mode).
    //       In tests the registry is omitted so existing tests are unaffected.
    if (registry) {
      const wss = new WebSocketServer({ server: this.srv, path: '/__ws' });
      wss.on('connection', ws => registry.register(ws));
    }
  }

  start = () => new Promise<void>((ok, fail) => {
    this.srv.listen(this.port, this.host, () => { log({ event: 'server_start', port: this.port, host: this.host }); ok(); });
    this.srv.on('error', fail);
  });

  stop = () => new Promise<void>(ok => this.srv.close(() => ok()));

  private handle(req: http.IncomingMessage, res: http.ServerResponse) {
    if (req.method !== 'POST') { this.reply(res, 405, { error: 'POST only', ok: false }); return; }
    let body = '';
    req.on('data', c => (body += c));
    req.on('end', () => {
      try {
        Promise.resolve(this.dispatch(JSON.parse(body) as ApiRequest))
          .then(r => this.reply(res, 200, r))
          .catch(() => this.reply(res, 500, { error: 'internal error', ok: false }));
      } catch {
        this.reply(res, 400, { error: 'invalid JSON', ok: false });
      }
    });
  }

  private dispatch(r: ApiRequest): Response | Promise<Response> {
    const { mgr, sm } = this;
    const handlers: Record<ApiRequest['command'], () => Response | Promise<Response>> = {
      // Sprint 1 — breakpoints
      set:      () => !r.file || !r.line ? { error: 'set requires file + line', ok: false }
                                         : mgr.set(r.file, r.line, r.condition ?? null, r.temporary),
      edit:     () => !r.id ? { error: 'edit requires id', ok: false }
                            : mgr.edit(r.id, { condition: r.condition, enabled: r.enabled, line: r.line }),
      clear:    () => !r.id ? { error: 'clear requires id', ok: false } : mgr.clear(r.id),
      clearAll: () => mgr.clearAll(),
      list:     () => mgr.list(),
      // Sprint 2 — session lifecycle
      start:    () => !r.config ? { state: 'idle', error: 'start requires config', ok: false } : sm.start(r.config),
      quit:     () => sm.quit(),
      restart:  () => sm.restart(),
      status:   () => sm.status(),
      // Sprint 3 — execution control
      continue: () => sm.continue(),
      next:     () => sm.next(),
      step:     () => sm.step(),
      return:   () => sm.return(),
      until:    () => sm.until(r.line),
      jump:     () => r.line === undefined ? { state: 'paused', error: 'jump requires line', ok: false } : sm.jump(r.line),
      // Sprint 4 — inspection
      print:       () => !r.expression ? { error: 'print requires expression', ok: false }       : sm.print(r.expression),
      prettyPrint: () => !r.expression ? { error: 'prettyPrint requires expression', ok: false } : sm.prettyPrint(r.expression),
      whatis:      () => !r.expression ? { error: 'whatis requires expression', ok: false }      : sm.whatis(r.expression),
      exec:        () => !r.expression ? { error: 'exec requires expression', ok: false }        : sm.exec(r.expression),
      display:     () => sm.display(r.expression),
      undisplay:   () => sm.undisplay(r.expression),
      args:        () => sm.args(),
      retval:      () => sm.retval(),
    };
    return (handlers[r.command] ?? (() => ({ error: `unknown: ${r.command}`, ok: false })))();
  }

  private reply(res: http.ServerResponse, status: number, body: Response) {
    const json = JSON.stringify(body);
    res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(json) });
    res.end(json);
  }
}
