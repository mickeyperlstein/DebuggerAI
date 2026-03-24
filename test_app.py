"""
Fake Python app — used to manually smoke-test DebuggingAI.

Try these in the Extension Development Host after pressing F5:
  1. Open this file
  2. Run "DebuggingAI: Set Breakpoint" on line 22 (process)
  3. Run "DebuggingAI: Set Breakpoint" on line 31 (total) with condition: total > 100
  4. Run "DebuggingAI: List Breakpoints" — check Output Channel
  5. From terminal: python test_app.py
  6. Observe breakpoints hit in VS Code gutter
"""

def add(a, b):
    result = a + b      # bp candidate: inspect a, b, result
    return result


def process(items):
    total = 0
    for item in items:
        total = add(total, item)   # ← set bp here
    return total


def main():
    data = [10, 20, 30, 50]
    total = process(data)          # ← set conditional bp: total > 100
    print(f"Total: {total}")
    assert total == 110, f"expected 110, got {total}"
    print("OK")


if __name__ == "__main__":
    main()
