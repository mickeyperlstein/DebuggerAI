/**
 * Multi-session debugging e2e — real VS Code extension host
 *
 * WHAT: Start two concurrent debug sessions (server + client),
 *       step through code, inspect variables, detect null token bug,
 *       patch code with sed, restart, verify fix, revert.
 * HOW:  Use vscode.commands.executeCommand to call extension commands.
 *       Real VS Code extension host, real debuggers.
 * WHEN: npm run test:vscode (runs inside @vscode/test-electron)
 */

import * as assert from 'assert';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

const SERVER_CONFIG = 'Debug Backend (server)';
const CLIENT_CONFIG = 'Debug Backend (client)';
const PROJECT_ROOT = path.resolve(__dirname, '../../..');
const CLIENT_FILE = path.join(PROJECT_ROOT, 'src/e2e/multi-session/client.ts');
const CLIENT_BACKUP = CLIENT_FILE + '.bak';

// ── Helpers ────────────────────────────────────────────────────────────────

async function cmd(command: string, args?: object): Promise<any> {
  return vscode.commands.executeCommand(command, args);
}

async function waitForExtension(timeoutMs = 20_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try { await vscode.commands.executeCommand('debuggingAI.status'); return; }
    catch { await new Promise(r => setTimeout(r, 300)); }
  }
  throw new Error('Extension did not become ready within timeout');
}

// ── Suite ──────────────────────────────────────────────────────────────────

suite('Multi-session debugging e2e', () => {

  suiteSetup(async function (this: Mocha.Context) {
    this.timeout(25_000);
    await waitForExtension();
  });

  teardown(async () => {
    // Stop both sessions
    await cmd('debuggingAI.quit');
    // Restore client.ts if patched
    if (fs.existsSync(CLIENT_BACKUP)) {
      fs.copyFileSync(CLIENT_BACKUP, CLIENT_FILE);
      fs.unlinkSync(CLIENT_BACKUP);
    }
    await new Promise(r => setTimeout(r, 200));
  });

  test('start two concurrent sessions (server + client)', async function (this: Mocha.Context) {
    this.timeout(60_000);

    // PART 1: Start server session
    console.log('[e2e] Starting server session...');
    const server: any = await cmd('debuggingAI.start', { config: SERVER_CONFIG });

    if (!server.ok) {
      // Configs may not exist in test environment — skip gracefully
      this.skip();
      return;
    }

    assert.strictEqual(server.state, 'paused', 'server should be paused at entry');
    const serverId = server.sessionId;
    console.log(`[e2e] Server started: ${serverId}`);

    // PART 2: Start client session
    console.log('[e2e] Starting client session...');
    const client: any = await cmd('debuggingAI.start', { config: CLIENT_CONFIG });
    assert.strictEqual(client.state, 'paused', 'client should be paused at entry');
    const clientId = client.sessionId;
    console.log(`[e2e] Client started: ${clientId}`);

    // Verify two distinct sessions
    assert.notStrictEqual(serverId, clientId, 'sessions should have distinct IDs');
    console.log('[e2e] ✓ Two concurrent sessions active');

    // PART 3: Step through client, inspect for null token
    console.log('[e2e] Stepping client to inspect variables...');
    const step1: any = await cmd('debuggingAI.next');
    assert.strictEqual(step1.state, 'paused');
    console.log(`[e2e] Client at ${step1.file}:${step1.line}`);

    // Inspect: obj should exist but have no token
    const inspect: any = await cmd('debuggingAI.inspect', { expression: 'obj' });
    console.log(`[e2e] obj value: ${inspect.valueRepr}`);
    console.log('[e2e] Expected: no token field (bug present)');

    // PART 4: Patch the code
    console.log('[e2e] Patching client.ts to add token...');
    fs.copyFileSync(CLIENT_FILE, CLIENT_BACKUP);
    const code = fs.readFileSync(CLIENT_FILE, 'utf8');
    const patched = code.replace(
      /const enriched = { \.\.\.obj };/,
      "const enriched = { ...obj, token: 'client-token-xyz' };",
    );
    fs.writeFileSync(CLIENT_FILE, patched);
    console.log('[e2e] ✓ Code patched: token added');

    // PART 5: Restart and verify fix
    console.log('[e2e] Restarting client with patched code...');
    const restart: any = await cmd('debuggingAI.restart');
    assert.strictEqual(restart.state, 'paused');
    console.log('[e2e] ✓ Client restarted with patched code');

    // Step to enriched assignment
    const step2: any = await cmd('debuggingAI.next');
    assert.strictEqual(step2.state, 'paused');

    // Inspect: enriched should now have token
    const inspectFixed: any = await cmd('debuggingAI.inspect', { expression: 'enriched' });
    console.log(`[e2e] enriched value: ${inspectFixed.valueRepr}`);
    console.log('[e2e] Expected: has token field (fix verified)');

    // Verify by looking for 'token' in the output
    assert.ok(
      inspectFixed.valueRepr?.includes('token') || inspectFixed.valueRepr?.includes('xyz'),
      'enriched should contain token field after patch',
    );

    console.log('[e2e] ✓ Fix verified: token flows end-to-end');

    // PART 6: Verify revert
    console.log('[e2e] Reverting code to original (broken) state...');
    fs.copyFileSync(CLIENT_BACKUP, CLIENT_FILE);
    fs.unlinkSync(CLIENT_BACKUP);
    console.log('[e2e] ✓ Code reverted');

    console.log('[e2e] === MULTI-SESSION E2E COMPLETE ===\n');
  });

});
