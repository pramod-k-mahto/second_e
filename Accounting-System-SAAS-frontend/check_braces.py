with open(r'd:\Accounting System\frontend\components\Layout.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

def count_tokens(text):
    opens = text.count('{')
    closes = text.count('}')
    open_tags = text.count('<')
    close_tags = text.count('>')
    return opens, closes, open_tags, close_tags

opens, closes, open_tags, close_tags = count_tokens(content)
print(f"Braces: {{ {opens}, }} {closes}")
# Note: simple tag counting is unreliable due to expressions, but let's see.
