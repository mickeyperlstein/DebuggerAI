# Hacker News — Show HN

**Title:** Show HN: DebuggingAI – MCP server giving AI agents live VS Code debugger control

**First comment:**

I built this for a specific problem: bugs that aren't in the code. I get a DBNULL where I expected a string. A field that exists in the schema but wasn't populated. A value that's technically valid but breaks an assumption four calls downstream. Reading source doesn't help because the code is correct. I need to see what actually came back at runtime. The logs don't help either — just noise and framework info.

The pattern I kept coming back to: I describe where things fall apart, Claude navigates the debugger itself, reads live variable state, tells me what broke. I provide the intent, it does the mechanical traversal. I've been calling it vibe debugging.

DebuggingAI connects to VS Code's Debug Adapter Protocol and exposes it as MCP tools. Claude Code can set breakpoints, run to them, and inspect live variable state the same way I would. I set a breakpoint right before the code that processes the DB response and let Claude read what's actually there. Not what the schema says. The real value, at that moment, in that session.

There's also a joint session mode — I'm in the same debug session as Claude at the same time.

I put together a demo on a simple Node.js bug so the mechanics are easy to follow on video. But honestly that's not the hard case. The hard case is stopping execution at the exact moment bad data enters the system and seeing it before it corrupts state downstream. That's where I think this actually earns its keep.

Tested on Claude Code and Cline. Works with any language VS Code supports.

Repo: github.com/mickeyperlstein/DebuggingAI, Docker: pitronot/debuggingai:latest, VS Code extension is in the marketplace.
