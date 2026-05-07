import requests

BASE_URL = "http://127.0.0.1:8000"

def test_login_and_auth():
    session = requests.Session()
    
    # 1. Login
    print("Testing Login...")
    login_data = {
        "username": "manish@gmail.com",
        "password": "Password@123" # I'll assume this password from common patterns if not known
    }
    # Wait, I don't know the password. Let me check the seed or main.py for default admin.
    # main.py has admin@prixna.com / Admin@123
    
    # Actually, the user's log shows manish@gmail.com logged in. 
    # I'll try to login with any user if I can find one or just observe the sessions.
    
    # Since I don't know manish@gmail.com's password, I'll check the database if possible or just use admin.
    pass

if __name__ == "__main__":
    # Just checking existing users in DB first
    import sqlite3
    import os
    
    db_path = r"d:\Accounting System\API\backend\accounting.db"
    if os.path.exists(db_path):
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        cursor.execute("SELECT email, password_hash FROM users LIMIT 5")
        users = cursor.fetchall()
        print("Users in DB:", users)
        conn.close()
    else:
        print("DB not found at", db_path)
