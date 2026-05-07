import re
import sys

def check_file(filename):
    with open(filename, 'r', encoding='utf-8') as f:
        lines = f.readlines()

    stack = []
    for i, line in enumerate(lines):
        # Match tags, but avoid self-closing tags like <div />
        # This regex matches <tag, </tag, or tag in <tag ... />
        tokens = re.findall(r'<(div|nav|aside|main|Link|button)(?:\s+[^>]*?)?(/?\s*)>', line)
        
        for tag, self_closing in tokens:
            if self_closing == '/': # Self-closing <tag />
                continue
            elif tag.startswith('/'): # Closing </tag>
                tag_name = tag[1:]
                if not stack:
                    print(f"Extra closing tag </{tag_name}> at line {i+1}")
                else:
                    last_tag, last_line = stack.pop()
                    if last_tag != tag_name:
                        print(f"Mismatched tag: <{last_tag}> from line {last_line} closed by </{tag_name}> at line {i+1}")
            else: # Opening <tag>
                stack.append((tag, i + 1))

    print(f"\nUnclosed tags in {filename} at EOF:")
    for tag, line in stack:
        print(f"<{tag}> from line {line}")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python debug_tags.py <filename>")
    else:
        check_file(sys.argv[1])
