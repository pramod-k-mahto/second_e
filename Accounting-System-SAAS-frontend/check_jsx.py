import re
import sys

def check_jsx_balance(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    # Regex to find opening and closing tags for common JSX elements
    # We'll focus on <div> since it's the known problem
    tags = re.findall(r'<(/?div(?:\s+[^>]*?)?)>', content)
    
    stack = []
    lines = content.split('\n')
    
    # Process the file line by line to keep track of line numbers
    for i, line in enumerate(lines, 1):
        # Find all tags on this line
        # Simplistic regex but good enough for <div> vs </div>
        line_tags = re.findall(r'<(div|/div)(?:\s|>|$)', line)
        for tag in line_tags:
            if tag == 'div':
                stack.append(i)
            elif tag == '/div':
                if not stack:
                    print(f"Extra </div> at line {i}")
                else:
                    stack.pop()

    if stack:
        print(f"Unclosed <div> tags opened at lines: {stack}")
    else:
        print("All <div> tags are balanced!")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python check_jsx.py <file_path>")
    else:
        check_jsx_balance(sys.argv[1])
