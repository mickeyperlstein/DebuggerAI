# Discord (Claude / Cline / Cursor servers)

vibe debugging — i describe where things fall apart, claude navigates the debugger, reads runtime state, tells me what broke. built something that actually makes this work.

DebuggingAI — mcp server that gives claude code real debugger access in vs code. set breakpoints, step through, read live variable values.

real use case: the code looks fine. but something from the db has the wrong shape. i get a DBNULL where i expected a string. a missing field. it breaks three calls downstream and only in production. logs don't help, just noise. asking ai doesn't help, it just guesses. i set a breakpoint right before the bad data enters the system, run to it, let claude read what actually came back. i hate those bugs.

joint session mode too — me and claude in the same debug session at the same time. that's how i actually use it.

to add it to claude code:
```
claude mcp add debuggingai -- node /path/to/DebuggingAI/out/clients/mcp/index.js
```

github: https://github.com/mickeyperlstein/DebuggingAI
docker: `docker pull pitronot/debuggingai:latest`
vs code extension: search "DebuggingAI"
