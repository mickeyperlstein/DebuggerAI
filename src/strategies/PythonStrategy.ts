/**
 * PythonStrategy — fixes the Python NameError in evaluate/scopes.
 *
 * WHAT: Issues a fresh stackTrace DAP request immediately before evaluate/scopes
 *       to obtain the raw debugpy frame ID that debugpy will accept.
 *
 * WHY (root cause of the NameError):
 *   vscode.debug.activeStackItem.frameId is VS Code's internal sequential ID
 *   (e.g. 3, 11, 33). When VS Code proxies customRequest('evaluate') to debugpy
 *   it forwards this ID as-is — it does NOT translate back to the raw Python
 *   id(frame) address (e.g. 4302698784) that debugpy uses as its frame key.
 *   debugpy cannot find the frame by the VS Code ID, falls back to module scope,
 *   and raises NameError: name 'a' is not defined.
 *
 *   The fresh stackTrace call returns the raw debugpy frame ID directly from
 *   debugpy's own response, valid for the immediately following evaluate request
 *   while the thread remains paused. This is what VS Code's Debug Console does
 *   internally: resolve the current frame right before evaluating.
 *
 * WHY no vscode imports:
 *   Strategies must be IDE-agnostic. The session is passed as `any` from
 *   VsCodeSessionAdapter. In Sprint N+2 the same strategy will work against
 *   a standalone DapClient with no VS Code involved.
 *
 * WHEN: Used for session types 'python' and 'debugpy'.
 */

import { LanguageStrategy, FrameContext } from './LanguageStrategy';

const STACK_TRACE_LEVELS = 1;

export class PythonStrategy implements LanguageStrategy {
  getLanguageName(): string {
    return 'python';
  }

  async resolveFrameId(_session: any, context: FrameContext): Promise<number | undefined> {
    // WHAT: Return the raw adapter frame ID captured before VS Code translated it.
    // WHY:  customRequest('stackTrace') returns VS Code's remapped sequential IDs
    //       (e.g., 3). customRequest('evaluate') does NOT translate back — it sends
    //       the ID as-is to debugpy, which then can't find its frame and evaluates
    //       at module scope (NameError). rawTopFrameId is the pre-translation ID
    //       intercepted from the stackTrace response in the DAP tracker.
    return context.rawTopFrameId ?? context.cachedFrameId;
  }
}
