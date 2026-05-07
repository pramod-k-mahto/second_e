# Frontend – Simple Accounting UI

Minimal double-entry accounting UI built with **Next.js (App Router)** and **Tailwind CSS**, talking to a FastAPI backend (`Simple Accounting API`).

## Requirements

- Node.js 18+

## Setup

```bash
cd frontend
npm install
npm run dev
```

By default the app runs at `http://localhost:3000` and expects the API at
`http://localhost:8000` (configurable via `NEXT_PUBLIC_API_BASE`).

## Main Features

- **Authentication** – Login/register against the FastAPI backend.
- **Companies** – Create, edit, delete and open companies.
- **Ledgers & Ledger Groups** – Manage chart of accounts per company.
- **Vouchers** – Create and edit vouchers (PAYMENT, RECEIPT, CONTRA, JOURNAL).
- **Reports** – Trial balance (and other reports, if enabled in the backend).

## Sidebar & Voucher Menu

- Left sidebar is split into two vertical parts:
  - **Left half** – Global navigation:
    - `Dashboard`
    - `Companies`
    - (For admin users) `Admin → Tenants`
  - **Right half** – Visible **after a company is opened**; shows:
    - `Voucher` menu with voucher types:
      - `Payment`, `Receipt`, `Contra`, `Journal`
      - Each links to `/companies/{companyId}/vouchers?type=...` and pre-selects that type.
    - `Current company` block with:
      - `Ledgers`, `Vouchers`, `Trial Balance`

The current voucher type is highlighted based on the `type` query parameter in the URL.

## Admin & Tenant Mode (Frontend)

The frontend includes a basic admin/tenant UI which assumes matching admin APIs exist in the backend:

- Uses `/auth/me` to read the logged-in user and their `role`.
- When `role === "admin"`:
  - An **Admin** section appears in the left sidebar.
  - `/admin/tenants` page is available to:
    - List tenants (`GET /admin/tenants`).
    - Create tenants via a simple form (`POST /admin/tenants`).
    - Navigate to tenant detail pages.
  - `/admin/tenants/[tenantId]` shows basic tenant details loaded from
    `GET /admin/tenants/{tenantId}`.

Non-admin users do not see the Admin section and use the app in normal (tenant) mode.

> Note: The backend must implement the corresponding `/admin/tenants` endpoints and include
> `role` in the `/auth/me` response (`UserRead.role`) for these features to work.
