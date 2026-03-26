# Reddit — r/node / r/javascript

**Title:** Built an MCP server that gives Claude Code live VS Code debugger access — useful when the bug is in your data, not your code

**Body:**

The Node bugs that take the longest aren't logic errors. They're the ones where a record comes back from the DB with the wrong shape. I get a DBNULL where I expected a string. A missing field. Some value that's technically valid but silently breaks something somewhere. I hate those.

The code looks fine. The tests pass. It only breaks in production because the test data was clean and the production record wasn't. And you can't reproduce it by reading anything. There's nothing to read.

I've been calling this vibe debugging. You describe where things fall apart, the AI navigates the debugger, reads what's actually in memory at runtime, and tells you what's wrong. You don't touch a single step-over button.

DebuggingAI is what makes that work. It's an MCP server that gives Claude Code live access to the VS Code debugger — `set_breakpoint`, `continue`, `next`, `step`, `print`, `evaluate`. ClaudeCode calls them like any other tool.

I set a breakpoint right before the code that processes the DB response. Run to it. Have AI inspect what actually came back, the actual runtime value. The AI sees exactly where the bad data first enters the call stack.

There's also a joint session mode where I'm in the same debug session as Claude at the same time. That's how I use it and I think it could even become a tutor now.

Works with any language VS Code supports.

GitHub: https://github.com/mickeyperlstein/DebuggingAI
Docker: `docker pull pitronot/debuggingai:latest`
VS Code extension: search "DebuggingAI"
