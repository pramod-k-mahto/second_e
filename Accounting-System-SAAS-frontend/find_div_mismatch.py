import re

with open(r'd:\Accounting System\frontend\components\Layout.tsx', 'r', encoding='utf-8') as f:
    lines = f.readlines()

stack = []
for i, line in enumerate(lines):
    line_clean = re.sub(r'//.*', '', line)
    # Match <div but not </div>
    opens = re.findall(r'<div\b', line_clean)
    closes = re.findall(r'</div\b', line_clean)
    
    for _ in opens:
        stack.append(i + 1)
    for _ in closes:
        if stack:
            stack.pop()
        else:
            print(f"Extra </div> at line {i+1}")

print("\nUnclosed <div> lines at EOF:")
print(stack)
