import { defineConfig } from '@vscode/test-cli';

export default defineConfig({
  files: 'out/test/suite/**/*.vscode.test.js',
  version: '1.96.4',
  launchArgs: ['--user-data-dir=/tmp/vscode-debuggingai-test'],
  workspaceFolder: '.',
  mocha: {
    timeout: 20_000,
  },
});
