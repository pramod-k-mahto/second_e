import re

def find_duty_tax_tables(file_path):
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # regex to find class, tablename and then check if duty_tax_id is in the class body before the next class
    classes = re.split(r'\nclass\s+', content)
    tables = []
    
    for cls_body in classes:
        # get class name from first line
        cls_name_match = re.match(r'^(\w+)', cls_body)
        if not cls_name_match: continue
        cls_name = cls_name_match.group(1)
        
        # get tablename
        table_match = re.search(r'__tablename__\s*=\s*\"(\w+)\"', cls_body)
        if not table_match: continue
        table_name = table_match.group(1)
        
        # check for duty_tax_id
        if 'duty_tax_id' in cls_body:
            tables.append((cls_name, table_name))
            
    return tables

if __name__ == "__main__":
    results = find_duty_tax_tables('backend/app/models.py')
    for cls_name, table_name in results:
        print(f"Class: {cls_name}, Table: {table_name}")
