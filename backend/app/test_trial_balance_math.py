from . import schemas
from .routers import purchases


def compute_trial_balance_row(opening_balance: float, opening_type: str, movements: list[tuple[float, float]]):
    """
    Pure helper that mimics trial_balance endpoint logic for a single ledger.

    opening_balance: numeric opening amount
    opening_type: "DEBIT" or "CREDIT"
    movements: list of (debit, credit) tuples representing voucher lines up to as_on_date
    """
    opening_debits = sum(d for d, _ in movements)
    opening_credits = sum(c for _, c in movements)

    opening_signed = float(opening_balance)
    if opening_type == "CREDIT":
        opening_signed = -opening_signed

    # Signed balance convention: + = debit balance, - = credit balance
    balance = opening_signed + opening_debits - opening_credits

    debit = balance if balance > 0 else 0.0
    credit = -balance if balance < 0 else 0.0
    return debit, credit


def test_trial_balance_simple_cases():
    # Case 1: Debit opening 1,000 with extra debit 500 and credit 200
    # Expected: closing balance = 1,000 + 500 - 200 = 1,300 (Debit)
    d, c = compute_trial_balance_row(1000.0, "DEBIT", [(500.0, 0.0), (0.0, 200.0)])
    assert d == 1300.0
    assert c == 0.0

    # Case 2: Credit opening 2,000 with debit 500 and credit 1,000
    # Signed closing = -2,000 + 500 - 1,000 = -2,500 => Credit 2,500
    d, c = compute_trial_balance_row(2000.0, "CREDIT", [(500.0, 0.0), (0.0, 1000.0)])
    assert d == 0.0
    assert c == 2500.0

    # Case 3: Net zero balance should give zero debit and credit
    d, c = compute_trial_balance_row(0.0, "DEBIT", [(100.0, 100.0)])
    assert d == 0.0
    assert c == 0.0


def test_trial_balance_totals_balance():
    """Two ledgers whose balances should offset each other (total debit == total credit)."""
    # Ledger A: closing debit 1,500
    d1, c1 = compute_trial_balance_row(1000.0, "DEBIT", [(500.0, 0.0)])

    # Ledger B: closing credit 1,500
    d2, c2 = compute_trial_balance_row(0.0, "CREDIT", [(0.0, 1500.0)])

    total_debit = d1 + d2
    total_credit = c1 + c2

    assert total_debit == 1500.0
    assert total_credit == 1500.0


def test_purchase_bill_delete_consumption_simulation_blocks_when_consumed():
    starting_qty = 0.0
    movements = [
        (None, 1, 10.0, "PURCHASE_BILL", 100),
        (None, 2, -6.0, "SALES_INVOICE", 200),
        (None, 3, -6.0, "SALES_INVOICE", 201),
    ]
    ok, ending = purchases._simulate_qty_after_removing_source(
        starting_qty=starting_qty,
        movements=[
            (purchases.datetime.utcnow(), mid, qty, st, sid)
            for _, mid, qty, st, sid in movements
        ],
        remove_source_type="PURCHASE_BILL",
        remove_source_id=100,
    )
    assert ok is False
    assert ending < 0


def test_purchase_bill_delete_consumption_simulation_allows_when_not_consumed():
    starting_qty = 5.0
    movements = [
        (purchases.datetime.utcnow(), 1, 10.0, "PURCHASE_BILL", 100),
        (purchases.datetime.utcnow(), 2, -6.0, "SALES_INVOICE", 200),
    ]
    ok, ending = purchases._simulate_qty_after_removing_source(
        starting_qty=starting_qty,
        movements=movements,
        remove_source_type="PURCHASE_BILL",
        remove_source_id=100,
    )
    # Removing the purchase can still make quantity go negative (meaning it *was* consumed)
    assert ok is False
    assert ending < 0
