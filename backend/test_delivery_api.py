import requests
import json
import uuid

BASE_URL = "http://localhost:8000"
COMPANY_ID = 1  # Assuming company 1 exists

# Note: We need a valid token. If we don't have one, we can either:
# 1. Login to get one
# 2. Assume auth is disabled for testing locally (it might not be).
# Let's try logging in as admin first.
login_data = {"username": "admin@example.com", "password": "password"} # standard fallback or we'll get it from env.
# Wait, maybe auth requires specific creds. Or we can just bypass if we hit the DB directly. But testing API is better.

# Actually, rather than guessing passwords, let's write a FastAPI test using TestClient, which bypasses the network stack and can mock auth!

from fastapi.testclient import TestClient
import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), 'app')))

try:
    from app.main import app
    from app import models
    from app.database import get_db, SessionLocal
    from app.auth import get_current_user
    
    # Mock auth context
    def mock_get_current_user():
        db = SessionLocal()
        user = db.query(models.User).first() # Just grab the first user
        db.close()
        if not user:
            raise Exception("No users found in DB to mock auth")
        return user
        
    app.dependency_overrides[get_current_user] = mock_get_current_user
    
    client = TestClient(app)
    
    print("Testing Delivery Places...")
    # Fetch a valid company
    db = SessionLocal()
    user = mock_get_current_user()
    company = db.query(models.Company).filter(models.Company.owner_id == user.id).first()
    db.close()
    if not company:
        raise Exception("No company found for the mock user")
    
    COMPANY_ID = company.id
    
    # 1. Create a Place
    res = client.post(f"/companies/{COMPANY_ID}/delivery/places", json={
        "name": f"Test Place {uuid.uuid4().hex[:6]}",
        "default_shipping_charge": 50.0,
        "is_active": True
    })
    print("Create Place Response:", res.status_code, res.text)
    place_id = res.json().get("id")
    
    if place_id:
        # Get places
        res = client.get(f"/companies/{COMPANY_ID}/delivery/places")
        print("Get Places Status:", res.status_code)
        
        # Update place
        res = client.put(f"/companies/{COMPANY_ID}/delivery/places/{place_id}", json={
            "default_shipping_charge": 75.0
        })
        print("Update Place Status:", res.status_code)
        
    print("\nTesting Delivery Partners...")
    res = client.post(f"/companies/{COMPANY_ID}/delivery/partners", json={
        "name": f"Test Partner {uuid.uuid4().hex[:6]}",
        "phone": "1234567890",
        "vehicle_number": "BA 1 PA 1",
        "is_active": True
    })
    print("Create Partner Response:", res.status_code, res.text)
    partner_id = res.json().get("id")
    
    if partner_id:
        # Get partners
        res = client.get(f"/companies/{COMPANY_ID}/delivery/partners")
        print("Get Partners Status:", res.status_code)
        
    print("\nTests complete!")
except Exception as e:
    print(f"Test script failed: {e}")
