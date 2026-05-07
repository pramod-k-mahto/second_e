import sys

def check_file(filename):
    with open(filename, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Remove strings and comments to avoid false positives
    content = re.sub(r'//.*', '', content)
    content = re.sub(r'/\*.*?\*/', '', content, flags=re.DOTALL)
    # content = re.sub(r'" .*?"', '""', content) # risky with JSX
    
    tags = re.findall(r'<([a-zA-Z0-9]+)|</([a-zA-Z0-9]+)>', content)
    stack = []
    
    # Common self-closing tags in this project
    self_closing = {'img', 'br', 'input', 'hr', 'SidebarIcon', 'NotificationItem', 'NotificationRecord', 'MasterSearchDialog'} 

    for open_tag, close_tag in tags:
        if open_tag:
            if open_tag not in self_closing:
                # Check for <Tag /> format
                # This is hard without a full parser, but let's assume if it ends with /> it's closed
                pass
            stack.append(open_tag)
        elif close_tag:
            if not stack:
                print(f"Extra closing tag </{close_tag}>")
                continue
            last = stack.pop()
            if last != close_tag:
                # Try to see if it was a self-closing component we didn't account for
                if last in ['SidebarIcon', 'NotificationItem', 'MasterSearchDialog']:
                    # Re-pop one more
                    if stack:
                        last = stack.pop()
                if last != close_tag:
                    print(f"Mismatched: <{last}> vs </{close_tag}>")

    print(f"Unclosed: {stack}")

import re
check_file(r'd:\Accounting System\frontend\components\Layout.tsx')
