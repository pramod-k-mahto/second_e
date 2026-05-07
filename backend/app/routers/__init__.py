# backend/app/routers/__init__.py
"""
Routers package. Only import router modules here.
"""

from . import auth
from . import companies
from . import ledgers
from . import vouchers

from . import admin_plans
from . import admin_users
from . import admin_tenants
from . import admin_logs
from . import admin_settings
from . import admin_maintenance
from . import admin_menu_templates
from . import admin_import

from . import reports
from . import tasks
from . import payroll
from . import website
from . import commissions
from . import setup
from . import chatbot
from . import production
from . import documents

__all__ = [
    "auth",
    "companies",
    "ledgers",
    "vouchers",
    "admin_plans",
    "admin_users",
    "admin_tenants",
    "admin_logs",
    "admin_settings",
    "admin_maintenance",
    "admin_menu_templates",
    "admin_import",
    "reports",
    "tasks",
    "payroll",
    "website",
    "commissions",
    "setup",
    "chatbot",
    "production",
    "documents",
]
