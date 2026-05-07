# Backend – Simple Accounting API

## Requirements

- Python 3.10+
- PostgreSQL

## Setup

1. Create and activate virtualenv (Windows):

```bash
python -m venv .venv
.venv\Scripts\activate
```

2. Install dependencies:

```bash
pip install -r requirements.txt
```

3. Set environment variables (example):

```bash
set DATABASE_URL=postgresql+psycopg2://postgres:admin@localhost:5432/simple_accounting
set SECRET_KEY=change-this
set ACCESS_TOKEN_EXPIRE_MINUTES=720
```

4. Create database objects using `db/init.sql` from repo root (via psql or pgAdmin).

5. Run server:

```bash
uvicorn app.main:app --reload --port 8000
```

API will be available at `http://localhost:8000`.
