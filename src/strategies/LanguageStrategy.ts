/**
 * LanguageStrategy — interface for language-specific DAP quirk handling.
 *
 * WHAT: Defines the contract each language adapter must implement to handle
 *       debugger-specific behaviour (frame ID resolution, type normalization, etc.)
 * WHY:  Each debug adapter (debugpy, pwa-node, delve) has quirks. Without this
 *       interface those quirks leak into the core session adapter as conditionals.
 *       Strategy pattern isolates each language's behaviour so adding Go/Ruby/etc.
 *       never touches existing code.
 * WHEN: Consulted by VsCodeSessionAdapter before every evaluate() and scopes() call.
 *
 * No vscode imports — strategies are pure adapters over raw DAP sessions.
 * Sprint N+2 will extend this interface with normalizeThread/Frame/Variable
 * when the standalone DapClient lands.
 */

export interface FrameContext {
  /** True when running inside the VS Code extension host (Path A). */
  hasVsCodeProxy: boolean;
  /**
   * The thread ID from the last stop event.
   * Used by strategies to issue a fresh stackTrace at evaluate time (Python path).
   */
  threadId?: number;
  /**
   * The raw DAP frame ID cached from the last stop event.
   * Fallback when a fresh stackTrace cannot be issued.
   */
  cachedFrameId?: number;
  /**
   * The raw adapter frame ID captured from the stackTrace RESPONSE before
   * VS Code translates it to its internal sequential IDs.
   *
   * WHY: VS Code's customRequest proxy translates adapter frame IDs to small
   *      sequential numbers in responses (e.g., debugpy's id(frame)=4302698784
   *      becomes 3). But customRequest('evaluate') does NOT translate back.
   *      By intercepting the response in onDidSendMessage before translation,
   *      we get the raw ID the adapter actually expects.
   */
  rawTopFrameId?: number;
}

export interface LanguageStrategy {
  getLanguageName(): string;

  /**
   * Resolve the effective frameId to pass to DAP evaluate/scopes requests.
   *
   * WHAT: Returns the frameId the underlying debug adapter will accept.
   * WHY:  Some adapters (debugpy) require the raw id(frame) value that was just
   *       returned by their own stackTrace response — not a cached or remapped ID.
   *       Others (pwa-node) work fine with the cached ID.
   * WHEN: Called immediately before every evaluate() and scopes() DAP request.
   *
   * @param session  The active DAP session — typed as `any` so strategies do not
   *                 import vscode. Callers pass vscode.DebugSession.
   * @param context  Pause-state context (threadId, cached frameId, proxy flag).
   * @returns        The frameId to forward to the adapter, or undefined to omit it.
   */
  resolveFrameId(session: any, context: FrameContext): Promise<number | undefined>;
}
