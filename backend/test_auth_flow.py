import requests

BASE_URL = "http://127.0.0.1:8000"

def test_login():
    session = requests.Session()
    # Assuming 'admin@prixna.com' exists with 'Admin@123' as per main.py default
    login_data = {
        "username": "admin@prixna.com",
        "password": "Admin@123"
    }
    
    print(f"Logging in to {BASE_URL}/auth/login...")
    resp = session.post(f"{BASE_URL}/auth/login", data=login_data)
    
    print(f"Status: {resp.status_code}")
    print(f"Headers: {resp.headers}")
    print(f"Cookies: {session.cookies.get_dict()}")
    
    if resp.status_code == 200:
        print("Login Success!")
        # Try a follow up request
        print(f"Fetching {BASE_URL}/companies/")
        resp2 = session.get(f"{BASE_URL}/companies/")
        print(f"Status: {resp2.status_code}")
        print(f"Response: {resp2.text[:200]}")
        
        # Try fetching /companies (no slash)
        print(f"Fetching {BASE_URL}/companies")
        resp3 = session.get(f"{BASE_URL}/companies")
        print(f"Status: {resp3.status_code}")
        print(f"Response: {resp3.text[:200]}")

if __name__ == "__main__":
    test_login()
