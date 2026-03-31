/**
 * DartStrategy — DAP frame resolution for Dart/Flutter debugger.
 *
 * WHAT: Returns the cached frameId unchanged (pass-through for now).
 * WHY:  The Dart debug adapter (dart-cli/flutter) accepts frame IDs similarly
 *       to pwa-node. We can extend this if Dart-specific quirks surface.
 * WHEN: Used for session type 'dart'.
 */

import { LanguageStrategy, FrameContext } from './LanguageStrategy';

export class DartStrategy implements LanguageStrategy {
  getLanguageName(): string {
    return 'dart';
  }

  async resolveFrameId(_session: any, context: FrameContext): Promise<number | undefined> {
    return context.cachedFrameId;
  }
}
