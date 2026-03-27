/**
 * HTTP E2E test entry point.
 * Run with: npm run test:http
 *
 * Requires the DebuggingAI extension to be active in a VS Code window
 * with its HTTP server listening on port 7890 (or DEBUGGINGAI_PORT env var).
 */

import * as path  from 'path';
import * as glob  from 'glob';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const Mocha = require('mocha');

export async function run(): Promise<void> {
  const mocha = new Mocha({ ui: 'tdd', color: true, timeout: 60_000 });
  const dir   = __dirname;
  const files = glob.sync('**/*.http.test.js', { cwd: dir });
  files.forEach((f: string) => mocha.addFile(path.join(dir, f)));

  return new Promise((resolve, reject) => {
    mocha.run((failures: number) => {
      if (failures > 0) {
        reject(new Error(`${failures} test(s) failed`));
      } else {
        resolve();
      }
    });
  });
}
