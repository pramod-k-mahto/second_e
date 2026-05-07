import re

with open(r'd:\Accounting System\frontend\components\Layout.tsx', 'r', encoding='utf-8') as f:
    text = f.read()

div_open = len(re.findall(r'<div\b', text))
div_close = len(re.findall(r'</div\b', text))
button_open = len(re.findall(r'<button\b', text))
button_close = len(re.findall(r'</button\b', text))
nav_open = len(re.findall(r'<nav\b', text))
nav_close = len(re.findall(r'</nav\b', text))
aside_open = len(re.findall(r'<aside\b', text))
aside_close = len(re.findall(r'</aside\b', text))
link_open = len(re.findall(r'<Link\b', text))
link_close = len(re.findall(r'</Link\b', text))

print(f"div: {div_open} / {div_close}")
print(f"button: {button_open} / {button_close}")
print(f"nav: {nav_open} / {nav_close}")
print(f"aside: {aside_open} / {aside_close}")
print(f"Link: {link_open} / {link_close}")
