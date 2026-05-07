import sys
import os

# Add the project root to sys.path
sys.path.append('d:\\Accounting System\\API\\backend')

from app.database import SessionLocal
from app.models import User
from app.auth import get_password_hash

def main():
    db = SessionLocal()
    try:
        pwd = get_password_hash('Test@123')
        
        test_users = [
            { "email": "billing@prixna.com", "name": "Ghost Billing Test", "role": "ghost_billing" },
            { "email": "support@prixna.com", "name": "Ghost Support Test", "role": "ghost_support" },
            { "email": "tech@prixna.com", "name": "Ghost Tech Test", "role": "ghost_tech" },
        ]
        
        for u_data in test_users:
            existing = db.query(User).filter(User.email == u_data['email']).first()
            if existing:
                print(f"User {u_data['email']} already exists.")
                continue
            
            user = User(
                email=u_data['email'],
                full_name=u_data['name'],
                password_hash=pwd,
                role=u_data['role'],
                is_active=True
            )
            db.add(user)
        
        db.commit()
        print("Tets users created successfully: billing@prixna.com, support@prixna.com, tech@prixna.com. Password: Test@123")
    finally:
        db.close()

if __name__ == "__main__":
    main()
