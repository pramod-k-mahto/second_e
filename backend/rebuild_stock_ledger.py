"""
Script to rebuild stock ledger for all existing transactions.
This reprocesses all sales invoices and purchase bills to populate stock data correctly.
"""

import requests
import sys

# Configuration - UPDATE THESE VALUES
BASE_URL = "http://localhost:8000"  # Your API base URL
COMPANY_ID = 14  # Your company ID
AUTH_TOKEN = "your_admin_token_here"  # Your admin authentication token

def repost_all_documents():
    """Repost all sales invoices and purchase bills to rebuild stock ledger."""
    
    headers = {"Authorization": f"Bearer {AUTH_TOKEN}"}
    
    print(f"Rebuilding stock ledger for company {COMPANY_ID}...")
    
    # Step 1: Get all sales invoices
    print("\nFetching sales invoices...")
    response = requests.get(
        f"{BASE_URL}/sales/companies/{COMPANY_ID}/invoices",
        headers=headers
    )
    
    if response.status_code != 200:
        print(f"Error fetching invoices: {response.text}")
        return
    
    invoices = response.json()
    print(f"Found {len(invoices)} invoices")
    
    # Step 2: Repost each invoice
    for invoice in invoices:
        invoice_id = invoice['id']
        invoice_number = invoice.get('invoice_number', invoice_id)
        
        print(f"Reposting invoice {invoice_number} (ID: {invoice_id})...")
        
        repost_response = requests.post(
            f"{BASE_URL}/inventory/companies/{COMPANY_ID}/documents/SALES_INVOICE/{invoice_id}/repost",
            headers=headers
        )
        
        if repost_response.status_code == 200:
            print(f"  ✓ Success")
        else:
            print(f"  ✗ Error: {repost_response.text}")
    
    # Step 3: Get all purchase bills
    print("\nFetching purchase bills...")
    response = requests.get(
        f"{BASE_URL}/purchases/companies/{COMPANY_ID}/bills",
        headers=headers
    )
    
    if response.status_code != 200:
        print(f"Error fetching bills: {response.text}")
        return
    
    bills = response.json()
    print(f"Found {len(bills)} bills")
    
    # Step 4: Repost each bill
    for bill in bills:
        bill_id = bill['id']
        bill_number = bill.get('bill_number', bill_id)
        
        print(f"Reposting bill {bill_number} (ID: {bill_id})...")
        
        repost_response = requests.post(
            f"{BASE_URL}/inventory/companies/{COMPANY_ID}/documents/PURCHASE_BILL/{bill_id}/repost",
            headers=headers
        )
        
        if repost_response.status_code == 200:
            print(f"  ✓ Success")
        else:
            print(f"  ✗ Error: {repost_response.text}")
    
    print("\n✅ Stock ledger rebuild complete!")
    print("Check your Stock of Items report - it should now show correct stock levels.")

if __name__ == "__main__":
    if AUTH_TOKEN == "your_admin_token_here":
        print("⚠️  Please update the AUTH_TOKEN in the script before running!")
        print("You can get your token from the browser's localStorage or network requests.")
        sys.exit(1)
    
    repost_all_documents()
