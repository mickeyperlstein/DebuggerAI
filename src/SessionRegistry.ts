/**
 * SessionRegistry — tracks all active VS Code debug sessions.
 *
 * WHAT: Listens to vscode.debug.onDidStartDebugSession and
 *       onDidTerminateDebugSession. Maintains a Map of all active sessions,
 *       classified by origin (launchJson vs testExplorer) and type.
 * WHY:  DebuggingAI needs to discover sessions started outside launch.json
 *       (e.g. Patrol Test Explorer). The registry is the source of truth.
 * WHEN: Instantiated once in extension.ts activate(). Survives reconnects.
 */

import * as vscode from 'vscode';
import { classifySession } from './SessionClassifier';

export interface SessionEntry {
  id: string;
  name: string;
  type: string;
  origin: 'launchJson' | 'testExplorer';
  timestamp: number;
}

export class SessionRegistry {
  private sessions = new Map<string, SessionEntry>();
  private subscriptions: vscode.Disposable[] = [];

  constructor() {
    this.listen();
  }

  /**
   * Listen to session lifecycle events and maintain the registry.
   */
  private listen(): void {
    // Register listener for new sessions
    const startSub = vscode.debug.onDidStartDebugSession((session: vscode.DebugSession) => {
      const classification = classifySession(session.configuration);
      const entry: SessionEntry = {
        id: session.id,
        name: session.name,
        type: session.type,
        origin: classification.origin,
        timestamp: Date.now(),
      };
      this.sessions.set(session.id, entry);
    });

    // Register listener for terminated sessions
    const termSub = vscode.debug.onDidTerminateDebugSession((session: vscode.DebugSession) => {
      this.sessions.delete(session.id);
    });

    this.subscriptions.push(startSub, termSub);
  }

  /**
   * Get all active sessions.
   */
  list(): SessionEntry[] {
    return Array.from(this.sessions.values());
  }

  /**
   * Get a session by ID.
   */
  get(id: string): SessionEntry | undefined {
    return this.sessions.get(id);
  }

  /**
   * Clean up subscriptions (called on deactivation).
   */
  dispose(): void {
    this.subscriptions.forEach(sub => sub.dispose());
    this.sessions.clear();
  }
}
