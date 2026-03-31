/**
 * SessionClassifier — pure classification of VS Code debug sessions.
 *
 * WHAT: Examines a VS Code session's configuration and returns its origin.
 * WHY:  Session origin (launchJson vs testExplorer) is a pure data transformation.
 *       Keeps vscode coupling out of the Registry.
 * WHEN: Called by SessionRegistry whenever a new session appears.
 *
 * No vscode import — operates on config objects only.
 */

export interface SessionClassification {
  origin: 'launchJson' | 'testExplorer';
}

/**
 * Classify a VS Code debug session based on its configuration.
 *
 * Origin: 'launchJson' if the session has a named config, 'testExplorer' otherwise.
 */
export function classifySession(sessionConfig: any): SessionClassification {
  // WHAT: Derive origin from whether config has a 'name' field.
  // WHY:  launch.json configs have explicit names; programmatic sessions get
  //       auto-generated names.
  const origin = sessionConfig.name && !sessionConfig._isDynamic ? 'launchJson' : 'testExplorer';
  return { origin };
}
