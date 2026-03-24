import * as http from 'http';
import { BreakpointManager } from './breakpoints';
import { SessionManager } from './session';
import { ApiRequest, BpResult, BpListResult } from './types';
import { SessionResult } from './interfaces/IDebugger';
import { log } from './log';

type Response = BpResult | BpListResult | SessionResult;

/**
 * Thin HTTP server — localhost only.
 * Routing is a direct map from command string to manager method.
 * No switch, no duplication.
 */
export class Server {
  private readonly srv: http.Server;

  constructor(
    private readonly mgr: BreakpointManager,
    private readonly sm: SessionManager,
    private readonly port: number,
  ) {
    this.srv = http.createServer((req, res) => this.handle(req, res));
  }

  start = () => new Promise<void>((ok, fail) => {
    this.srv.listen(this.port, '127.0.0.1', () => { log({ event: 'server_start', port: this.port }); ok(); });
    this.srv.on('error', fail);
  });

  stop = () => new Promise<void>(ok => this.srv.close(() => ok()));

  private handle(req: http.IncomingMessage, res: http.ServerResponse) {
    if (req.method !== 'POST') { this.reply(res, 405, { ok: false, error: 'POST only' }); return; }
    let body = '';
    req.on('data', c => (body += c));
    req.on('end', () => {
      try {
        Promise.resolve(this.dispatch(JSON.parse(body) as ApiRequest))
          .then(r => this.reply(res, 200, r))
          .catch(() => this.reply(res, 500, { ok: false, error: 'internal error' }));
      } catch {
        this.reply(res, 400, { ok: false, error: 'invalid JSON' });
      }
    });
  }

  private dispatch(r: ApiRequest): Response | Promise<Response> {
    const { mgr, sm } = this;
    const handlers: Record<ApiRequest['command'], () => Response | Promise<Response>> = {
      set:      () => !r.file || !r.line ? { ok: false, error: 'set requires file + line' }
                                         : mgr.set(r.file, r.line, r.condition ?? null, r.temporary),
      edit:     () => !r.id ? { ok: false, error: 'edit requires id' }
                            : mgr.edit(r.id, { condition: r.condition, enabled: r.enabled, line: r.line }),
      clear:    () => !r.id ? { ok: false, error: 'clear requires id' } : mgr.clear(r.id),
      clearAll: () => mgr.clearAll(),
      list:     () => mgr.list(),
      start:    () => !r.config ? { ok: false, state: 'idle', error: 'start requires config' } : sm.start(r.config),
      quit:     () => sm.quit(),
      restart:  () => sm.restart(),
      status:   () => sm.status(),
    };
    return (handlers[r.command] ?? (() => ({ ok: false, error: `unknown: ${r.command}` })))();
  }

  private reply(res: http.ServerResponse, status: number, body: Response) {
    const json = JSON.stringify(body);
    res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(json) });
    res.end(json);
  }
}
