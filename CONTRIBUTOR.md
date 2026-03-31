# DebuggingAI — Contributor Guide for AI Agents

This document is the operating contract for any AI agent working in this repository.
Read it fully before writing a single line of code.

---

## 1. Start here: the current sprint

**Requirements live in `docs/features/current_sprint/`.**

Before doing anything else:

```
ls docs/features/current_sprint/
```

Every `.feature` file is a Gherkin specification. Each scenario is a unit of work.
Scenarios are the source of truth — not comments, not README text, not chat history.
If a scenario is ambiguous, ask before implementing.

**Folder layout:**

| Folder | Meaning |
|---|---|
| `docs/features/current_sprint/` | Active sprint — implement these |
| `docs/features/backlog/` | Future sprints — do not touch unless explicitly asked |
| `docs/features/completed/` | Shipped — reference only |

---

## 2. How to implement a feature

1. Read every scenario in the relevant `.feature` file end-to-end.
2. Find the code that needs to change (`src/`, `extension/`). Read it before editing it.
3. Implement the minimum code that makes all scenarios pass. No extras, no speculative abstractions.
4. Follow the code style rules: SOLID, strategy, minimal, VERY MINIMAL. DRY. No unnecessary comments, docstrings, or type annotations on unchanged code.
5. Do not add error handling for impossible cases. Trust internal guarantees.
6. Do not add features, refactor, or "improve" code that was not in scope.
7. When editing a function or class, only modify the lines that are necessary to implement the feature. and add comments on WHY WHAT HOW only

---

## 3. The e2e test is mandatory — no shortcuts

**Every sprint closes with a full end-to-end test of the real system. This is non-negotiable.**
See `docs/features/current_sprint/21_sprint_e2e_requirement.feature` for the exact definition.

### What "full e2e" means

- A **real VS Code instance** with the DebuggingAI extension installed (via `vscode-extension-tester`).
- A **real target process** being debugged — Node.js or Python. No mocks. No fake events.
- The test **plays the role of the AI agent**: it drives the debugger via MCP tools or HTTP (port 7890), reads real variable values, observes real bus events.
- **All assertions are on real runtime data.** Hardcoded expected values are only allowed when the fixture explicitly sets them.

### How to run the e2e suite

```bash
npm run test:e2e
```

This launches a real VS Code instance via `vscode-extension-tester`. It must pass before any sprint is considered done.

### What is NOT acceptable as "done"

- Unit tests only — not sufficient.
- Mocked debugger / mocked bus events — not sufficient.
- Manual verification — not sufficient.
- A passing CI pipeline without the e2e job — not sufficient.

**If `npm run test:e2e` does not pass, the sprint is not closed. No exceptions.**

---

## 4. The sprint is NOT done until

- [ ] All scenarios in `current_sprint/` are implemented.
- [ ] All unit tests pass: `npm test`
- [ ] The full e2e suite passes: `npm run test:e2e`
- [ ] No linting errors: `npm run lint`

Only after all four are green may you commit and open a PR.

---

## 5. Architecture primer

- `src/` — core TypeScript: `BusRouter`, `DebugStateMachine`, MCP server, CDP/DAP adapters.
- `extension/` — VS Code extension host: command registration, session lifecycle, Output Channel.
- `src/e2e/` — end-to-end tests (real VS Code, real processes).
- `src/e2e/multi-session/` — current sprint e2e fixture (server + client bug/fix scenario).

The MCP server exposes debug tools to AI agents over HTTP on port 7890.
The `BusRouter` is the shared pub/sub backbone — all session events flow through it.

Full architecture: `docs/ARCHITECTURE.md`.

---

## 6. Do not

- Do not mock the debugger, the bus, or VS Code APIs in e2e tests.
- Do not open a PR until e2e passes.
- Do not implement backlog features unless explicitly asked.
- Do not skip linting hooks (`--no-verify`).
- Do not add features, refactor, or "improve" code that was not in scope.
- Do not write to `docs/features/completed/` — that is Mickey's job.
