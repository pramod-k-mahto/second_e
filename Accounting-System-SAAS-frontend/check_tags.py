import re

with open(r'd:\Accounting System\frontend\components\Layout.tsx', 'r', encoding='utf-8') as f:
    lines = f.readlines()

stack = []
for i, line in enumerate(lines):
    # Very crude regex for tags
    tags = re.findall(r'<([a-zA-Z0-9]+)|</([a-zA-Z0-9]+)>', line)
    for t in tags:
        start, end = t
        if start:
            if start not in ['img', 'br', 'input', 'hr']: # ignore self-closing common ones
                stack.append((start, i+1))
        elif end:
            if not stack:
                print(f"Extra closing tag </{end}> at line {i+1}")
            else:
                last_start, last_line = stack.pop()
                if last_start != end:
                    print(f"Mismatched tag: <{last_start}> from line {last_line} closed by </{end}> at line {i+1}")

if stack:
    for s, l in stack:
        print(f"Unclosed tag <{s}> from line {l}")
