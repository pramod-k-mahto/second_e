import requests

BASE_URL = "http://localhost:8000"

def get_token(email, password, tenant_id=None):
    headers = {}
    if tenant_id:
        headers["X-Tenant-Id"] = str(tenant_id)
    
    resp = requests.post(
        f"{BASE_URL}/auth/login",
        data={"username": email, "password": password},
        headers=headers
    )
    return resp

def test_tenant_login_isolation():
    print("--- Test: Tenant Login Isolation ---")
    
    # 1. Correct Tenant Login (User is Tenant 24)
    resp = get_token("testuser@example.com", "testpwd123", tenant_id=24)
    if resp.status_code != 200:
        print(f"ERR: Correct login failed: {resp.status_code} {resp.json()}")
        return
    print(f"Login with CORRECT tenant (24): {resp.status_code} SUCCESS")
    
    # 2. Incorrect Tenant Login (User attempts Tenant 25)
    resp = get_token("testuser@example.com", "testpwd123", tenant_id=25)
    print(f"Login with INCORRECT tenant (25): {resp.status_code} {resp.json().get('detail', '')}")
    assert resp.status_code == 401
    assert "User does not belong to this tenant" in resp.json().get('detail', '')

def test_tenant_immutability():
    print("\n--- Test: Tenant ID Immutability ---")
    
    # Get superadmin token (testuser is now superadmin)
    login_resp = get_token("testuser@example.com", "testpwd123")
    token = login_resp.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    
    # Get test user ID
    user_search_resp = requests.get(f"{BASE_URL}/admin/users?q=testuser@example.com", headers=headers)
    test_user_id = user_search_resp.json()[0]["id"]
    print(f"Found test user ID: {test_user_id}")

    # Try to change test user's tenant from 24 to 25
    update_resp = requests.put(
        f"{BASE_URL}/admin/users/{test_user_id}",
        json={"tenant_id": 25},
        headers=headers
    )
    print(f"Superadmin trying to change Tenant 24 -> 25: {update_resp.status_code} {update_resp.json().get('detail', '')}")
    assert update_resp.status_code == 403
    assert "Tenant ID is immutable" in update_resp.json().get('detail', '')

if __name__ == "__main__":
    try:
        test_tenant_login_isolation()
        test_tenant_immutability()
        print("\nALL TESTS PASSED!")
    except Exception as e:
        print(f"\nTEST FAILED: {e}")
