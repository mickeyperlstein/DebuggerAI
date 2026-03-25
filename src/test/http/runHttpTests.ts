/**
 * Standalone HTTP test runner.
 * Runs mocha directly against the compiled HTTP test files.
 * Does NOT require VS Code or @vscode/test-electron.
 *
 * Prerequisites: DebuggingAI extension running in a VS Code window.
 */

import { run } from './index';

run().then(
  () => process.exit(0),
  err => { console.error(err); process.exit(1); },
);
