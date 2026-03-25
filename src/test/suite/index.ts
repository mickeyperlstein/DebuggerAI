import * as path from 'path';
import * as fs   from 'fs';
import Mocha     from 'mocha';

export async function run(): Promise<void> {
  const mocha = new Mocha({ ui: 'tdd', color: true, timeout: 15_000 });
  const dir   = __dirname;

  fs.readdirSync(dir)
    .filter(f => f.endsWith('.vscode.test.js'))
    .forEach(f => mocha.addFile(path.join(dir, f)));

  return new Promise((resolve, reject) =>
    mocha.run(failures => failures ? reject(new Error(`${failures} tests failed`)) : resolve()),
  );
}
