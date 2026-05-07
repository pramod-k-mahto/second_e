
import os
import sys

# Add the API folder to sys.path
sys.path.append(r"d:\Accounting System\API")

from backend.app.main import app
from fastapi.routing import APIRoute

for route in app.routes:
    if isinstance(route, APIRoute):
        if "production" in route.path or "costing" in route.path:
            print(f"{route.methods} {route.path}")
