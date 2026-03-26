# LinkedIn

The bugs that take the longest aren't logic errors. They're the ones where the code is correct but the data isn't.

I get a DBNULL where I expected a string. A field that exists in the schema but wasn't populated. A value that's technically valid but silently breaks something four function calls downstream. It doesn't show up in unit tests. It shows up in production, and reading the code doesn't help because the code isn't wrong. The logs don't help either — just noise. And asking AI doesn't help because it's just guessing. I hate those.

I've been calling this vibe debugging. I describe the problem. Claude navigates the debugger, reads what's actually in memory at runtime, and tells me what broke. I don't step through anything myself. I provide the intent, it does the mechanical work.

I built DebuggingAI to make that real. It's an MCP server that gives Claude Code live access to the VS Code debugger — `set_breakpoint`, `continue`, `next`, `step`, `print`, `evaluate`. I set a breakpoint right before the crash, run to it, and inspect what actually came back from the DB — not what the schema says should be there, the actual runtime value.

There's a joint session mode where I'm in the same debug session as Claude at the same time. That's how I use it day to day: I navigate to the right place, Claude reads the state and tells me what's wrong. I think it could even become a tutor now.

I put together a demo on a simple Node.js bug so the mechanics are easy to follow. But honestly that's not where I reach for this. The real value is stopping execution at the exact moment bad data enters the system and seeing it before it corrupts state downstream.

Open source. VS Code extension published. Docker image on Hub.

github.com/mickeyperlstein/DebuggingAI
