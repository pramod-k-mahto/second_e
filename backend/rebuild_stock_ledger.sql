-- Step 1: Clear existing stock ledger and movement entries
-- (This will remove old incorrect data)
DELETE FROM stock_movements WHERE company_id = :company_id;
DELETE FROM stock_ledger WHERE company_id = :company_id;

-- Note: After running this SQL, you need to call the API endpoint:
-- POST /inventory/documents/SALES_INVOICE/{invoice_id}/repost
-- POST /inventory/documents/PURCHASE_BILL/{bill_id}/repost
-- 
-- For each invoice and bill in your system.
-- Or use the Python script provided in rebuild_stock_ledger.py
