from __future__ import annotations

import argparse
import json
import os
import sys
from typing import Any

import httpx


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Smoke test for BOM + production flow.",
    )
    parser.add_argument("--base-url", default=os.getenv("API_BASE_URL", "http://127.0.0.1:8000"))
    parser.add_argument("--token", default=os.getenv("ACCESS_TOKEN"))
    parser.add_argument("--email", default=os.getenv("AUTH_EMAIL"))
    parser.add_argument("--password", default=os.getenv("AUTH_PASSWORD"))
    parser.add_argument("--tenant-id", default=os.getenv("AUTH_TENANT_ID"))
    parser.add_argument("--company-id", type=int, default=int(os.getenv("COMPANY_ID", "0") or "0"))
    parser.add_argument("--finished-product-id", type=int, default=int(os.getenv("FINISHED_PRODUCT_ID", "0") or "0"))
    parser.add_argument("--component-product-id", type=int, default=int(os.getenv("COMPONENT_PRODUCT_ID", "0") or "0"))
    parser.add_argument("--production-qty", type=float, default=float(os.getenv("PRODUCTION_QTY", "1")))
    parser.add_argument("--component-qty", type=float, default=float(os.getenv("COMPONENT_QTY", "1")))
    parser.add_argument("--component-wastage-percent", type=float, default=float(os.getenv("COMPONENT_WASTAGE_PERCENT", "0")))
    parser.add_argument("--component-unit", default=os.getenv("COMPONENT_UNIT", "pcs"))
    return parser.parse_args()


def _fail(msg: str) -> None:
    print(f"[FAIL] {msg}")
    raise SystemExit(1)


def _ok(msg: str) -> None:
    print(f"[OK] {msg}")


def _request(
    client: httpx.Client,
    method: str,
    url: str,
    *,
    expected_status: int | None = None,
    json_body: dict[str, Any] | None = None,
) -> Any:
    resp = client.request(method, url, json=json_body)
    if expected_status is not None and resp.status_code != expected_status:
        body = resp.text
        _fail(
            f"{method} {url} returned {resp.status_code}, expected {expected_status}. Body: {body}"
        )
    try:
        return resp.json()
    except Exception:
        _fail(f"{method} {url} did not return JSON. Body: {resp.text}")
    return None


def _login_and_get_token(
    base_url: str,
    *,
    email: str,
    password: str,
    tenant_id: str | None = None,
) -> str:
    url = f"{base_url.rstrip('/')}/auth/login"
    headers = {"Content-Type": "application/x-www-form-urlencoded"}
    if tenant_id:
        headers["X-Tenant-Id"] = str(tenant_id)

    with httpx.Client(timeout=60.0) as client:
        resp = client.post(
            url,
            headers=headers,
            data={
                "username": email,
                "password": password,
            },
        )
        if resp.status_code != 200:
            _fail(f"Auto-login failed ({resp.status_code}): {resp.text}")
        try:
            payload = resp.json()
        except Exception:
            _fail(f"Auto-login returned non-JSON response: {resp.text}")
        token = payload.get("access_token")
        if not token:
            _fail("Auto-login did not return access_token")
        return str(token)


def _stock_map(rows: list[dict[str, Any]]) -> dict[int, float]:
    out: dict[int, float] = {}
    for row in rows:
        pid = int(row.get("product_id"))
        out[pid] = float(row.get("qty_on_hand", 0))
    return out


def _assert_near(actual: float, expected: float, msg: str, tol: float = 1e-6) -> None:
    if abs(actual - expected) > tol:
        _fail(f"{msg}. expected={expected:.6f}, actual={actual:.6f}")


def main() -> None:
    args = _parse_args()
    token = args.token
    if not token:
        if args.email and args.password:
            token = _login_and_get_token(
                args.base_url,
                email=str(args.email),
                password=str(args.password),
                tenant_id=args.tenant_id,
            )
            _ok("Auto-login succeeded")
        else:
            _fail(
                "Missing auth. Pass --token (or ACCESS_TOKEN), "
                "or pass --email/--password (or AUTH_EMAIL/AUTH_PASSWORD)."
            )
    if args.company_id <= 0:
        _fail("Invalid --company-id")
    if args.finished_product_id <= 0 or args.component_product_id <= 0:
        _fail("Invalid finished/component product ids")
    if args.production_qty <= 0 or args.component_qty <= 0:
        _fail("Production and component qty must be > 0")

    base = args.base_url.rstrip("/")
    company_id = args.company_id
    finished_id = args.finished_product_id
    component_id = args.component_product_id
    required_component_qty = (
        args.production_qty
        * args.component_qty
        * (1.0 + (args.component_wastage_percent / 100.0))
    )

    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }

    with httpx.Client(headers=headers, timeout=60.0) as client:
        stock_url = f"{base}/inventory/companies/{company_id}/stock/summary"
        before_rows = _request(client, "GET", stock_url, expected_status=200)
        before_stock = _stock_map(before_rows)
        before_finished = before_stock.get(finished_id, 0.0)
        before_component = before_stock.get(component_id, 0.0)
        _ok(
            f"Pre-stock finished={before_finished:.6f}, component={before_component:.6f}"
        )

        bom_payload = {
            "product_id": finished_id,
            "items": [
                {
                    "component_product_id": component_id,
                    "quantity": args.component_qty,
                    "unit": args.component_unit,
                    "wastage_percent": args.component_wastage_percent,
                }
            ],
        }
        bom_url = f"{base}/production/companies/{company_id}/bom"
        bom = _request(client, "POST", bom_url, expected_status=200, json_body=bom_payload)
        _ok(f"BOM created id={bom.get('id')} version={bom.get('version')}")

        prod_payload = {
            "product_id": finished_id,
            "quantity": args.production_qty,
        }
        prod_url = f"{base}/production/companies/{company_id}/production-orders"
        prod = _request(client, "POST", prod_url, expected_status=200, json_body=prod_payload)
        order_id = int(prod.get("id"))
        _ok(f"Production order created id={order_id}, status={prod.get('status')}")

        get_prod_url = f"{base}/production/companies/{company_id}/production-orders/{order_id}"
        fetched = _request(client, "GET", get_prod_url, expected_status=200)
        if int(fetched.get("id")) != order_id:
            _fail("Fetched production order id mismatch")
        _ok("Production order fetch succeeded")

        after_rows = _request(client, "GET", stock_url, expected_status=200)
        after_stock = _stock_map(after_rows)
        after_finished = after_stock.get(finished_id, 0.0)
        after_component = after_stock.get(component_id, 0.0)
        _ok(
            f"Post-stock finished={after_finished:.6f}, component={after_component:.6f}"
        )

        expected_finished = before_finished + args.production_qty
        expected_component = before_component - required_component_qty
        _assert_near(
            after_finished,
            expected_finished,
            "Finished product stock delta mismatch",
        )
        _assert_near(
            after_component,
            expected_component,
            "Component stock delta mismatch",
        )

    print(
        json.dumps(
            {
                "result": "PASS",
                "company_id": company_id,
                "finished_product_id": finished_id,
                "component_product_id": component_id,
                "production_qty": args.production_qty,
                "expected_component_consumption": required_component_qty,
                "before": {
                    "finished_qty": before_finished,
                    "component_qty": before_component,
                },
                "after": {
                    "finished_qty": after_finished,
                    "component_qty": after_component,
                },
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n[FAIL] Interrupted by user")
        sys.exit(1)
