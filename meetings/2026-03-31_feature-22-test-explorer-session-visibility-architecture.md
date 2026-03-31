# Meeting: Feature 22 — Test Explorer Session Visibility Architecture
Date: 2026-03-31 Time: now

## Participants
- MOD + ARCH: Claude — playing architect + facilitator
- (no additional spawned agents — solo architect session)

## Goal
Design the right architecture for Feature 22 (Test Explorer session visibility) before any code is written. Decide: where does Patrol/Dart/Flutter detection live, what files get created, and how does it plug into the existing system without muddying the strategy pattern.

## Relevant Info
- Feature spec: `docs/features/current_sprint/22_test_explorer_session_visibility.feature`
- Existing pattern: `src/strategies/` has `LanguageStrategy.ts`, `NodeStrategy.ts`, `PythonStrategy.ts` — keyed by session type in `STRATEGY_REGISTRY` in `VsCodeSessionAdapter.ts`
- New requirement: listen for ALL debug sessions via `vscode.debug.onDidStartDebugSession` (not just named launch.json configs)
- Patrol sessions identified by `PATROL_TEST_SERVER_PORT` in `session.configuration.dartDefines` or `args`
- Need: session registry, session picker/list, `list_sessions` endpoint, Dart strategy
- Mickey's constraint: language/DAP code must stay in strategy files — no language logic bleeding into registry, adapters, or extension.ts

## Agenda
1. Where does Patrol/Flutter session classification live? (classifier vs. DartStrategy vs. something else)
2. What new files are needed and what is each one's single responsibility?
3. How does `list_sessions` flow from extension → WS → server → MCP?
4. Any scope concerns or risks before we say "go"?

## Notes
(live notes — updated during the meeting)

## Rolling Summary
(updated every ~5 exchanges)

## Decisions

### Architecture approved:
- **`SessionClassifier.ts`** (new): Pure function, no vscode import. Examines `session.configuration`, returns `{ origin: 'testExplorer' | 'launchJson', label: string, isPatrol: boolean }`. Patrol detected by `PATROL_TEST_SERVER_PORT` in `dartDefines` or `args`.
- **`SessionRegistry.ts`** (new): Listens to `vscode.debug.onDidStartDebugSession` / `onDidTerminateDebugSession`. Maintains `Map<sessionId, SessionEntry>`. Uses `SessionClassifier` to tag each session. Exposes `list(): SessionEntry[]`.
- **`DartStrategy.ts`** (new): Implements `LanguageStrategy` for Dart/Flutter DAP frame resolution. Can be pass-through initially (like `NodeStrategy`), extended later if quirks surface.
- **`VsCodeSessionAdapter.ts`** (modify): Add `'dart'` → `DartStrategy` to `STRATEGY_REGISTRY`.
- **`ws-protocol.ts`** (modify): Add `WsCmdListSessions` type.
- **`VsCodeExtensionClient.ts`** (modify): Accept `SessionRegistry`, handle `listSessions` command.
- **`extension.ts`** (modify): Instantiate `SessionRegistry`, pass to `VsCodeExtensionClient`.
- **`ClientAdapter.ts`** (modify): Add `listSessions()` RPC method.
- **`server.ts`** (modify): Add `sessions` handler in dispatch.
- **`types.ts`** (modify): Add `'sessions'` to `ApiRequest['command']` union.

### Scope:
- Feature 22 is session **discovery** only — no attach/session-switching logic in this sprint.
- AI sees `list_sessions` response; existing session switching happens later.

### e2e:
- Real VS Code, real Patrol session (or mock it with programmatic `vscode.debug.startDebugging` call).
- Assert session appears in registry with correct `origin`, `label`, `isPatrol` flag.
