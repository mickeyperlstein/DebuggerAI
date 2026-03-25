# Owner Preferences (Mickey Perlstein)

## Code Style

- SOLID, minimal, DRY
- No over-engineering — don't add features beyond what's asked
- No docstrings/comments on unchanged code
- Add comments only for non-obvious logic — use WHAT / WHY / WHEN format:
  - WHAT: what this code does
  - WHY: why this approach was chosen
  - WHEN: when this code runs

## Architecture Principles

- This extension talks to **VS Code's debug API only** — never to language adapters directly
- No language-specific branches (`if session.type === 'python'`) — adapter-agnostic always
- Like a user: knows step, next, continue, set breakpoint, evaluate. Nothing more.
- `session.customRequest(...)` is the right VS Code layer for DAP commands
- `vscode.debug.activeStackItem` is the right VS Code layer for current frame info

## Collaboration Style

- Mickey asks precise architectural questions — answer architecturally, not with hacks
- When debugging, add [DIAG] console.error logging, run tests, read output, then fix. Remove logging after fix.
- Don't repeat things that failed — see investigation files.
- Commit often when asked, with meaningful messages.
- Memory files go in `.claude/agent-memory/` inside the project folder, NOT in `~/.claude/`

## Project Context

- The extension is used by AI agents to debug programs autonomously
- Think of it as an AI using VS Code's debugger the same way a human would
- Mickey is building this for agents like Claude, Cline, Cursor to use
- Sprint 5 will add Go language support
