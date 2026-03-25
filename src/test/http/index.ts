/**
 * HTTP E2E test entry point.
 * Run with: npm run test:http
 *
 * Requires the DebuggingAI extension to be active in a VS Code window
 * with its HTTP server listening on port 7890 (or DEBUGGINGAI_PORT env var).
 */

import * as path from 'path';
import * as Mocha from 'mocha';
import * as glob  from 'glob';

export async function run(): Promise<void> {
  const mocha = new Mocha({ ui: 'tdd', color: true, timeout: 60_000 });
  const dir   = __dirname;
  const files = glob.sync('**/*.http.test.js', { cwd: dir });
  files.forEach(f => mocha.addFile(path.join(dir, f)));

  return new Promise((resolve, reject) => {
    mocha.run(failures => {
      if (failures > 0) {
        reject(new Error(`${failures} test(s) failed`));
      } else {
        resolve();
      }
    });
  });
}
