# X / Twitter Thread

**Tweet 1 — hook:**
Vibe debugging.

Like vibe coding, but for bugs. You describe the problem. AI navigates the debugger, reads runtime state, tells you what's wrong. You steer. It does the mechanical work.

I built something that actually makes this work. Thread.

---

**Tweet 2:**
The real use case: production bugs caused by data, not code.

Wrong DB record, unexpected null, missing field — crash happens 4 calls downstream. Tests pass. Code is correct. I just need to see what actually came back from the DB at runtime. And I couldn't ask AI because it was just guessing.

---

**Tweet 3:**
DebuggingAI is an MCP server that gives Claude Code live access to the VS Code debugger.

I set a breakpoint right before the crash. Run to it. Read the actual runtime value — not what the schema says should be there, what's actually there.

---

**Tweet 4:**
Joint session mode — me and Claude in the same debug session at the same time.

I navigate to the crash. Claude reads the state and tells me what's wrong.

Works with @AnthropicAI Claude Code, Claude Desktop, Cline, Cursor.

---

**Tweet 5:**
Open source. VS Code extension live. Docker image ready.

github.com/mickeyperlstein/DebuggingAI

---

# Hebrew Tweet

הבאגים הכי קשים הם לא בקוד — הם ב-data.

רשומה ב-DB עם null שלא ציפיתי לו. שדה שחסר. ערך שתקף אבל שובר הנחה 4 קריאות עמוק. הקוד בסדר. הנתונים לא.

בניתי שרת MCP שנותן ל-AI גישה חיה לדיבאגר של VS Code. עוצרים בדיוק כשה-data הרע נכנס ורואים אותו בזמן ריצה. זה vibe debugging.

github.com/mickeyperlstein/DebuggingAI
