"""
demo_bug.py — DebuggingAI recording script.

Bug: flatten() uses a mutable default argument.
First call looks fine. Second call returns corrupted data.
Looks correct on reading — only visible at runtime.
"""


def flatten(lst, result=[]):
    """Recursively flatten a nested list into result."""
    for item in lst:
        if isinstance(item, list):
            flatten(item, result)
        else:
            result.append(item)
    return result


if __name__ == "__main__":
    first  = flatten([1, [2, 3], [4, [5, 6]]])
    print(f"first:  {first}")   # expect [1, 2, 3, 4, 5, 6]

    second = flatten([7, 8])
    print(f"second: {second}")  # expect [7, 8]  ← actually [1, 2, 3, 4, 5, 6, 7, 8]

    assert second == [7, 8], f"BUG: got {second}"
