/**
 * Fake TypeScript app — language-agnostic debugger test fixture.
 *
 * Mirrors test_app.py exactly (same structure, same data, same assertion).
 * Use "Debug test_app.ts" launch config to debug this file (via ts-node).
 *
 *   1. Run "DebuggingAI: Set Breakpoint" on line 21 (add call inside process)
 *   2. Run "DebuggingAI: Set Breakpoint" on line 27 (total call) with condition: total > 100
 *   3. Launch "Debug test_app.ts" and observe breakpoints hitting
 */

function add(a: number, b: number): number {
  const result: number = a + b; // bp candidate: inspect a, b, result
  return result;
}

function process(items: number[]): number {
  let total = 0;
  for (const item of items) {
    total = add(total, item); // ← set bp here
  }
  return total;
}

function main(): void {
  const data: number[] = [10, 20, 30, 50];
  const total: number = process(data); // ← set conditional bp: total > 100
  console.log(`Total: ${total}`);
  console.assert(total === 110, `expected 110, got ${total}`);
  console.log('OK');
}

main();
