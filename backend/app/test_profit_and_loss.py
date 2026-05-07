from datetime import date

from . import schemas


def test_profit_and_loss_gross_and_net():
    rows = [
        schemas.ProfitAndLossRow(group_name="Sales", group_type="INCOME", amount=1000.0),
        schemas.ProfitAndLossRow(group_name="Service Income", group_type="INCOME", amount=500.0),
        schemas.ProfitAndLossRow(group_name="Purchases", group_type="EXPENSE", amount=600.0),
        schemas.ProfitAndLossRow(group_name="Cost of Goods Sold", group_type="EXPENSE", amount=100.0),
        schemas.ProfitAndLossRow(group_name="Rent", group_type="EXPENSE", amount=200.0),
    ]

    total_income = sum(r.amount for r in rows if r.group_type == "INCOME")
    total_expense = sum(r.amount for r in rows if r.group_type == "EXPENSE")

    SALES_GROUPS = {"Sales", "Service Income"}
    COGS_GROUPS = {"Purchases", "Cost of Goods Sold"}

    sales_income = sum(r.amount for r in rows if r.group_type == "INCOME" and r.group_name in SALES_GROUPS)
    cogs_total = sum(r.amount for r in rows if r.group_type == "EXPENSE" and r.group_name in COGS_GROUPS)

    gross_profit = sales_income - cogs_total
    net_profit = total_income - total_expense

    assert total_income == 1500.0
    assert total_expense == 900.0
    assert gross_profit == 800.0  # (1000 + 500) - (600 + 100)
    assert net_profit == 600.0    # 1500 - (600 + 100 + 200)
