# Reddit — r/programming

**Title:** Built an MCP server that gives Claude Code live VS Code debugger access — useful when your bug is in the data, not the code

**Body:**

Last week I spent three hours on a bug that wasn't actually in the code. My code was correct. The logic was correct. Somewhere in the queue a record came back from the DB with a DBNULL where I'd assumed a string, and it didn't blow up until four calls later.

Ask three developers what to do. You'll get three different answers — add more logs, ask AI, re-read the code. None of them help. The logs are noise. AI is guessing. And there's nothing wrong with the code to re-read. I hate those bugs. I've wasted days on them.

So I built something. I've been calling it vibe debugging — I describe where things fall apart, Claude navigates the debugger, reads the actual runtime state, tells me what broke. I find the spot. It does the inspection work.

DebuggingAI is an MCP server that makes this possible. It gives Claude Code live access to the VS Code debugger. I set a breakpoint right before the crash, run to it, and Claude reads whatever actually came back from the DB. Not what the schema says. Not what the test fixtures use. The real value, at that moment, in that session.

I put together a demo on a simple Node.js bug so the mechanics are easy to follow on video. But honestly that's not where I reach for this. I reach for it when I need to stop execution at the exact moment bad data enters the system and see it before it corrupts state downstream.

There's also a joint session mode where I'm in the same debug session as Claude at the same time. That's how I actually use it most days. I think it could even become a tutor now.

Works with any language VS Code supports.
Tested on Claude Code and Cline.

GitHub: https://github.com/mickeyperlstein/DebuggingAI
Docker: `docker pull pitronot/debuggingai:latest`
VS Code extension: search "DebuggingAI"
