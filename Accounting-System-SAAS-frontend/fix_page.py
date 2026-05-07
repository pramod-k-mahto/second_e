
import os

filepath = r"d:\Accounting System\frontend\app\companies\[companyId]\reports\mis-cash-flow\page.tsx"

with open(filepath, 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Remove line 1487 (1-indexed is 1486)
# Fix indentation for 1485, 1486
# Actually, I'll just check if they are correctly closing.

# Let's search for the pattern.
# We want to replace:
#                 </div>
#                 </div>
#             </div>
# with:
#                     </div>
#                 </div>
#             </div>

found = False
for i in range(len(lines)-2):
    if "</div>" in lines[i] and "</div>" in lines[i+1] and "</div>" in lines[i+2]:
        if i > 1470 and i < 1500:
             # This is likely the spot.
             print(f"Found candidate at line {i+1}")
             # We want to remove one </div> and fix indentation.
             # Based on my analysis, 1486 and 1487 derived from 1201 and 1164.
             # 1485 closed 1235.
             
             # I'll just rewrite the block 1480-1490.

new_lines = lines[:1484] # Up to 1484
new_lines.append("                    </div>\n") # 1236
new_lines.append("                </div>\n") # 1235
new_lines.append("            </div>\n") # 1201
new_lines.extend(lines[1488:]) # From 1489 onwards

with open(filepath, 'w', encoding='utf-8') as f:
    f.writelines(new_lines)

print("File updated.")
