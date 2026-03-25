/**
 * NodeStrategy — pass-through implementation for pwa-node (Node.js / TypeScript).
 *
 * WHAT: Returns the cached frameId unchanged.
 * WHY:  pwa-node works correctly with the frameId emitted by onDidChangeActiveStackItem.
 *       No remapping or fresh stackTrace needed.
 * WHEN: Used for session types 'pwa-node', 'node', 'node2'.
 */

import { LanguageStrategy, FrameContext } from './LanguageStrategy';

export class NodeStrategy implements LanguageStrategy {
  getLanguageName(): string {
    return 'node';
  }

  async resolveFrameId(_session: any, context: FrameContext): Promise<number | undefined> {
    return context.cachedFrameId;
  }
}
