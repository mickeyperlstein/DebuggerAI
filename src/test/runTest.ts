import * as path from 'path';
import { spawnSync } from 'child_process';
import {
  downloadAndUnzipVSCode,
  resolveCliArgsFromVSCodeExecutablePath,
  runTests,
} from '@vscode/test-electron';

const USER_DATA_DIR  = '/tmp/vscode-debuggingai-test';
const VSCODE_VERSION = '1.96.4';

// Extensions required by the integration tests.
// ms-python.debugpy provides the 'python' debug type (used by Sprint 2 session tests).
const REQUIRED_EXTENSIONS = ['ms-python.debugpy'];

async function main() {
  // Claude Code (and VS Code extension hosts in general) export
  // ELECTRON_RUN_AS_NODE=1, which makes the Electron binary behave as raw
  // Node.js rather than as VS Code.  Unset it before spawning the test host.
  delete process.env.ELECTRON_RUN_AS_NODE;

  const extensionDevelopmentPath = path.resolve(__dirname, '../../');
  const extensionTestsPath       = path.resolve(__dirname, './suite/index');

  // ── 1. Download (or reuse cached) VS Code ─────────────────────────────────
  const vscodeExecutablePath = await downloadAndUnzipVSCode(VSCODE_VERSION);
  const [cli, ...cliArgs] = resolveCliArgsFromVSCodeExecutablePath(vscodeExecutablePath);

  // ── 2. Install required extensions into the isolated test profile ──────────
  // Extensions land in USER_DATA_DIR/extensions — cached across runs until /tmp
  // is cleared.  Only downloads on first run or after a reboot.
  for (const ext of REQUIRED_EXTENSIONS) {
    console.log(`Installing extension: ${ext}`);
    const result = spawnSync(
      cli,
      [...cliArgs, '--user-data-dir', USER_DATA_DIR, '--install-extension', ext],
      { encoding: 'utf-8', stdio: 'inherit' },
    );
    if (result.status !== 0) {
      console.warn(`Warning: could not install ${ext} (exit ${result.status}) — session tests will be skipped`);
    }
  }

  // ── 3. Run tests ──────────────────────────────────────────────────────────
  await runTests({
    vscodeExecutablePath,
    extensionDevelopmentPath,
    extensionTestsPath,
    launchArgs: [
      '--user-data-dir', USER_DATA_DIR,
      // Open the repo as the workspace so vscode.workspace.workspaceFolders
      // is populated and launch.json configs are readable by session commands.
      extensionDevelopmentPath,
    ],
  });
}

main().catch(err => { console.error(err); process.exit(1); });
