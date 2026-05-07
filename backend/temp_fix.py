import sys, re

def update_file(filepath):
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()
    except Exception as e:
        print(f"Error reading {filepath}: {e}")
        return

    # remove buildBatchRequests
    pattern1 = r'  const buildBatchRequests = \(\): StockSummaryBatchRequestItem\[\] => \{.*?\n  };\n'
    content = re.sub(pattern1, '', content, flags=re.DOTALL)

    # replace refreshStock useEffect
    pattern2 = r'  useEffect\(\(\) => \{\n    const refreshStock = async \(\) => \{\n      if \(\!companyId\) return;.*?void refreshStock\(\);\n  \}, \[companyId, (items, warehouses|lines|today)\]\);'
    
    replacement2 = '''  useEffect(() => {
    const refreshStock = async () => {
      if (!companyId) return;

      try {
        setLoadingStock(true);
        setStockError(null);
        
        const todayStr = new Date().toISOString().slice(0, 10);
        const { data } = await api.get(`/inventory/companies/${companyId}/stock-summary?as_on_date=${todayStr}`);
        const results = Array.isArray(data) ? data : [];
        const map = new Map<string, number>();
        for (const r of results) {
          const key = `${r.item_id}:${r.warehouse_id || "null"}`;
          map.set(key, parseFloat(String(r.quantity_on_hand) || "0"));
        }
        setStockMap(map);
      } catch {
        setStockError("Failed to load stock availability.");
      } finally {
        setLoadingStock(false);
      }
    };

    void refreshStock();
  }, [companyId]);'''
  
    content_new = re.sub(pattern2, replacement2, content, flags=re.DOTALL)
    if content_new != content:
        with open(filepath, 'w', encoding='utf-8', newline='\r\n') as f:
            f.write(content_new)
        print('Fixed: ' + filepath)
    else:
        print('Regex did not match: ' + filepath)

base = r'd:/Accounting System/frontend/app/companies/[companyId]'
update_file(base + '/purchases/bills/page.tsx')
update_file(base + '/sales/pos/page.tsx')
update_file(base + '/sales/invoices/page.tsx')
