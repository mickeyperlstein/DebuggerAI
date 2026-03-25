import * as path from 'path';
import { spawnSync, spawn, ChildProcess } from 'child_process';
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

function startServer(): ChildProcess {
  // Start the standalone DebuggingAI server so the VS Code extension client
  // can connect during tests. Without this the extension never becomes ready.
  const serverScript = path.resolve(__dirname, '../../out/bin/server.js');
  const proc = spawn(process.execPath, [serverScript], {
    stdio: 'pipe',
    env: { ...process.env, DEBUGAI_PORT: '7890' },
  });
  proc.stdout?.on('data', d => process.stdout.write(`[server] ${d}`));
  proc.stderr?.on('data', d => process.stderr.write(`[server] ${d}`));
  return proc;
}

async function waitForServer(port = 7890, retries = 20): Promise<void> {
  const http = await import('http');
  for (let i = 0; i < retries; i++) {
    await new Promise(r => setTimeout(r, 500));
    const ok = await new Promise<boolean>(resolve => {
      const req = http.get(`http://127.0.0.1:${port}/`, r => { r.resume(); resolve(r.statusCode !== undefined); });
      req.on('error', () => resolve(false));
    });
    if (ok) return;
  }
  throw new Error(`DebuggingAI server did not start on port ${port}`);
}

async function main() {
  // Claude Code (and VS Code extension hosts in general) export
  // ELECTRON_RUN_AS_NODE=1, which makes the Electron binary behave as raw
  // Node.js rather than as VS Code.  Unset it before spawning the test host.
  delete process.env.ELECTRON_RUN_AS_NODE;

  const extensionDevelopmentPath = path.resolve(__dirname, '../../');
  const extensionTestsPath       = path.resolve(__dirname, './suite/index');

  // ── 1. Start standalone server ─────────────────────────────────────────────
  const serverProc = startServer();
  await waitForServer();
  console.log('DebuggingAI server ready on port 7890');

  // ── 2. Download (or reuse cached) VS Code ─────────────────────────────────
  const vscodeExecutablePath = await downloadAndUnzipVSCode(VSCODE_VERSION);
  const [cli, ...cliArgs] = resolveCliArgsFromVSCodeExecutablePath(vscodeExecutablePath);

  // ── 3. Install required extensions into the isolated test profile ──────────
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

  // ── 4. Run tests ──────────────────────────────────────────────────────────
  try {
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
  } finally {
    serverProc.kill();
  }
}

main().catch(err => { console.error(err); process.exit(1); });
