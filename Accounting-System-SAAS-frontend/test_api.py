
import requests
import os

# Assuming the backend is at http://localhost:8000
# We need a token. I'll try to find one or just see if the endpoint is open for now (unlikely).
url = "http://localhost:8000/admin/tenants"
try:
    # Attempt without auth first
    response = requests.get(url)
    print(f"Status Code: {response.status_code}")
    if response.status_code == 200:
        data = response.json()
        for t in data:
            print(f"Tenant: {t.get('name')} - User Count: {t.get('users_count')} - Companies Count: {t.get('companies_count')}")
    else:
        print(f"Response: {response.text}")
except Exception as e:
    print(f"Error: {e}")
