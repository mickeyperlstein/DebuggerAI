import * as crypto from 'crypto';
import { ISessionAdapter, StopEvent } from './ISessionAdapter';
import { SessionResult, SessionState, StepResult } from './interfaces/IDebugger';
import { log } from './log';

/**
 * Pure session state machine.
 * No vscode imports — depends only on ISessionAdapter (injected).
 * Sprint 3 execution commands will call setPaused/setRunning/setExited
 * to keep state current.
 */
export class SessionManager {
  private state: SessionState = 'idle';
  private sessionId: string | null = null;
  private file: string | null = null;
  private line: number | null = null;

  constructor(private readonly adapter: ISessionAdapter) {}

  async start(configName: string): Promise<SessionResult> {
    if (this.state !== 'idle' && this.state !== 'exited') {
      return { ok: false, state: this.state, error: 'session already running' };
    }
    this.state = 'starting';
    const event = await this.adapter.startDebugging(configName);
    if (!event) {
      this.state = 'idle';
      return { ok: false, state: 'idle', error: `config not found: ${configName}` };
    }
    this.sessionId = crypto.randomUUID();
    this.file = event.file;
    this.line = event.line;
    this.state = 'paused';
    log({ event: 'session_start', config: configName, sessionId: this.sessionId });
    return { ok: true, state: 'paused', sessionId: this.sessionId, file: event.file, line: event.line };
  }

  async quit(): Promise<SessionResult> {
    if (this.state === 'idle' || this.state === 'exited') {
      return { ok: true, state: 'idle' };
    }
    await this.adapter.stopDebugging();
    this.reset();
    log({ event: 'session_quit' });
    return { ok: true, state: 'idle' };
  }

  async restart(_args?: string): Promise<SessionResult> {
    if (this.state === 'idle' || this.state === 'exited') {
      return { ok: false, state: 'idle', error: 'no session running' };
    }
    const event = await this.adapter.restartDebugging();
    this.state = 'paused';
    this.file = event.file;
    this.line = event.line;
    log({ event: 'session_restart' });
    return { ok: true, state: 'paused', file: event.file, line: event.line, sessionId: this.sessionId ?? undefined };
  }

  async status(): Promise<SessionResult> {
    return {
      ok: true,
      state: this.state,
      file: this.file ?? undefined,
      line: this.line ?? undefined,
      sessionId: this.sessionId ?? undefined,
    };
  }

  // ── Sprint 3 — Execution control ─────────────────────────────────────────

  async continue(): Promise<StepResult> {
    if (this.state !== 'paused') return { ok: false, state: this.state, error: 'not paused' };
    this.setRunning();
    return this.applyStop(await this.adapter.sendExecution('continue'));
  }

  async next(): Promise<StepResult> {
    if (this.state !== 'paused') return { ok: false, state: this.state, error: 'not paused' };
    this.setRunning();
    return this.applyStop(await this.adapter.sendExecution('next'));
  }

  async step(): Promise<StepResult> {
    if (this.state !== 'paused') return { ok: false, state: this.state, error: 'not paused' };
    this.setRunning();
    return this.applyStop(await this.adapter.sendExecution('stepIn'));
  }

  async return(): Promise<StepResult> {
    if (this.state !== 'paused') return { ok: false, state: this.state, error: 'not paused' };
    this.setRunning();
    return this.applyStop(await this.adapter.sendExecution('stepOut'));
  }

  async until(line?: number): Promise<StepResult> {
    if (this.state !== 'paused') return { ok: false, state: this.state, error: 'not paused' };
    this.setRunning();
    const ev = line !== undefined
      ? await this.adapter.sendUntil(this.file ?? '', line)
      : await this.adapter.sendExecution('next');
    return this.applyStop(ev);
  }

  async jump(line: number): Promise<StepResult> {
    if (this.state !== 'paused') return { ok: false, state: this.state, error: 'not paused' };
    const result = await this.adapter.sendJump(this.file ?? '', line);
    if ('error' in result) return { ok: false, state: 'paused', error: result.error };
    this.setPaused(result.file, result.line);
    return { ok: true, state: 'paused', file: result.file, line: result.line, reason: result.reason };
  }

  // ── State hooks for Sprint 3 execution commands ───────────────────────────

  setPaused(file: string, line: number): void { this.state = 'paused'; this.file = file; this.line = line; }
  setRunning(): void { this.state = 'running'; }
  setExited(): void { this.reset(); this.state = 'exited'; }

  private applyStop(ev: StopEvent | null): StepResult {
    if (!ev || ev.reason === 'exited') {
      this.setExited();
      return { ok: true, state: 'exited' };
    }
    this.setPaused(ev.file, ev.line);
    return { ok: true, state: 'paused', file: ev.file, line: ev.line, reason: ev.reason, function: ev.function };
  }

  private reset(): void {
    this.state = 'idle';
    this.sessionId = null;
    this.file = null;
    this.line = null;
  }
}
