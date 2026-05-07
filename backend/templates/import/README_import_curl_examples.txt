1) Create import job
curl -X POST http://localhost:8000/admin/import/jobs \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"tenant_id":1,"company_id":1,"source_type":"csv","data_type":"opening_balances"}'

2) Upload file
curl -X POST http://localhost:8000/admin/import/jobs/<job_id>/upload \
  -H "Authorization: Bearer <token>" \
  -F "file=@opening_balances_template.csv"

3) Save mapping (opening_balances)
curl -X POST http://localhost:8000/admin/import/jobs/<job_id>/mapping \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "mapping_name":"default",
    "mapping_json":{
      "ledger_name":"ledger_name",
      "opening_balance":"opening_balance",
      "opening_balance_type":"opening_balance_type",
      "external_ref":"external_ref"
    }
  }'

4) Validate
curl -X POST http://localhost:8000/admin/import/jobs/<job_id>/validate \
  -H "Authorization: Bearer <token>"

5) Commit
curl -X POST http://localhost:8000/admin/import/jobs/<job_id>/commit \
  -H "Authorization: Bearer <token>"

---
Sales invoice flat-row mapping example:

{
  "group_key": "invoice_no",
  "header": {
    "date": "invoice_date",
    "customer_name": "customer",
    "reference": "invoice_no",
    "external_ref": "external_ref"
  },
  "line": {
    "item_name": "item",
    "quantity": "qty",
    "rate": "rate",
    "discount": "discount",
    "tax_rate": "tax_rate",
    "warehouse_id": "warehouse_id"
  }
}
