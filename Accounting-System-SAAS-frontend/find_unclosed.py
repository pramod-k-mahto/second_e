import re

with open(r'd:\Accounting System\frontend\components\Layout.tsx', 'r', encoding='utf-8') as f:
    lines = f.readlines()

stack = []
for i, line in enumerate(lines):
    # Match tags, but be careful with self-closing and attributes
    # This is still crude but let's try to track line numbers
    tokens = re.findall(r'<(div|nav|aside|main|Link|button|MenuPermissionsProvider)|</(div|nav|aside|main|Link|button|MenuPermissionsProvider)>', line)
    for open_tag, close_tag in tokens:
        if open_tag:
            # Check for self-closing in same token (unlikely for these but still)
            if not line.strip().endswith('/>') or open_tag not in line: 
                 stack.append((open_tag, i + 1))
        elif close_tag:
            if not stack:
                print(f"Extra closing tag </{close_tag}> at line {i+1}")
            else:
                last_tag, last_line = stack.pop()
                if last_tag != close_tag:
                    print(f"Mismatched tag: <{last_tag}> from line {last_line} closed by </{close_tag}> at line {i+1}")

print("\nUnclosed tags at EOF:")
for tag, line in stack:
    print(f"<{tag}> from line {line}")
