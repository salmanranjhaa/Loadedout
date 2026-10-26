"""budget accounts: every entry belongs to a bank account or credit card

Adds budget_accounts, budget_entries.account_id / to_account_id (transfers such
as paying the card bill) and users.budget_limits (monthly budget per category).

Existing entries are sorted into accounts:
  1. "[UBS] Lidl" style tags become accounts (a tag used only for card purchases
     becomes a credit card) and the tag is removed from the description.
  2. Untagged entries naming an account ("Carry forward (UBS personal account)")
     go to that account.
  3. Other card purchases go to the user's credit card, everything else to their
     bank account ("Credit card" / "Main account" are created when missing).
  4. Card payments move money from the bank account to the credit card.

Revision ID: b4c5d6e7f8a9
Revises: a3b4c5d6e7f8
Create Date: 2026-10-26
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "b4c5d6e7f8a9"
down_revision: Union[str, None] = "a3b4c5d6e7f8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

TAG = r"'^\[([^\]]+)\]\s*'"
FIRST_OF_KIND = """(SELECT a.id FROM budget_accounts a
                    WHERE a.user_id = e.user_id AND a.kind = '{kind}' ORDER BY a.id LIMIT 1)"""


def upgrade() -> None:
    op.create_table(
        "budget_accounts",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("name", sa.String(60), nullable=False),
        sa.Column("kind", sa.String(20), nullable=False, server_default="bank"),
        sa.Column("opening_balance", sa.Float(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("user_id", "name", name="uq_budget_accounts_user_name"),
    )
    op.create_index("ix_budget_accounts_id", "budget_accounts", ["id"])
    op.create_index("ix_budget_accounts_user_id", "budget_accounts", ["user_id"])
    op.add_column("budget_entries", sa.Column("account_id", sa.Integer(), sa.ForeignKey("budget_accounts.id"), nullable=True))
    op.add_column("budget_entries", sa.Column("to_account_id", sa.Integer(), sa.ForeignKey("budget_accounts.id"), nullable=True))
    op.create_index("ix_budget_entries_account_id", "budget_entries", ["account_id"])
    op.add_column("users", sa.Column("budget_limits", sa.JSON(), nullable=True))

    # 1. Tags become accounts
    op.execute(f"""
        INSERT INTO budget_accounts (user_id, name, kind)
        SELECT user_id, left(substring(description from {TAG}), 60),
               CASE WHEN bool_and(payment_method = 'card') THEN 'credit_card' ELSE 'bank' END
        FROM budget_entries
        WHERE description ~ {TAG}
        GROUP BY user_id, left(substring(description from {TAG}), 60)
    """)
    op.execute(f"""
        UPDATE budget_entries e SET
            account_id = a.id,
            description = NULLIF(btrim(regexp_replace(e.description, {TAG}, '')), '')
        FROM budget_accounts a
        WHERE a.user_id = e.user_id AND e.description ~ {TAG}
          AND a.name = left(substring(e.description from {TAG}), 60)
    """)
    # 2. Untagged entries that name an account (longest name wins: "UBS Card" over "UBS")
    op.execute("""
        UPDATE budget_entries e SET account_id = (
            SELECT a.id FROM budget_accounts a
            WHERE a.user_id = e.user_id
              AND position(lower(a.name) IN lower(e.description)) > 0
              AND (a.kind = 'credit_card') = (e.payment_method = 'card')
            ORDER BY length(a.name) DESC LIMIT 1)
        WHERE e.account_id IS NULL AND e.description IS NOT NULL AND e.category <> 'card_payment'
    """)
    # 3. Default accounts for whatever is left
    op.execute("""
        INSERT INTO budget_accounts (user_id, name, kind)
        SELECT DISTINCT e.user_id, 'Credit card', 'credit_card' FROM budget_entries e
        WHERE (e.payment_method = 'card' OR e.category = 'card_payment')
          AND NOT EXISTS (SELECT 1 FROM budget_accounts a WHERE a.user_id = e.user_id AND a.kind = 'credit_card')
        ON CONFLICT (user_id, name) DO NOTHING
    """)
    op.execute("""
        INSERT INTO budget_accounts (user_id, name, kind)
        SELECT DISTINCT e.user_id, 'Main account', 'bank' FROM budget_entries e
        WHERE e.account_id IS NULL AND (e.payment_method <> 'card' OR e.category = 'card_payment')
          AND NOT EXISTS (SELECT 1 FROM budget_accounts a WHERE a.user_id = e.user_id AND a.kind = 'bank')
        ON CONFLICT (user_id, name) DO NOTHING
    """)
    op.execute(f"""
        UPDATE budget_entries e SET account_id = {FIRST_OF_KIND.format(kind='credit_card')}
        WHERE e.account_id IS NULL AND e.payment_method = 'card' AND e.category <> 'card_payment'
    """)
    op.execute(f"""
        UPDATE budget_entries e SET account_id = {FIRST_OF_KIND.format(kind='bank')}
        WHERE e.account_id IS NULL
    """)
    # 4. Card payments: bank -> credit card
    op.execute(f"""
        UPDATE budget_entries e SET to_account_id = {FIRST_OF_KIND.format(kind='credit_card')}, payment_method = 'cash'
        WHERE e.category = 'card_payment'
    """)


def downgrade() -> None:
    # Keep which account each entry used, as the tag it came from
    op.execute("""
        UPDATE budget_entries e SET description = left('[' || a.name || '] ' || coalesce(e.description, ''), 255)
        FROM budget_accounts a WHERE a.id = e.account_id
    """)
    op.drop_column("users", "budget_limits")
    op.drop_index("ix_budget_entries_account_id", table_name="budget_entries")
    op.drop_column("budget_entries", "to_account_id")
    op.drop_column("budget_entries", "account_id")
    op.drop_index("ix_budget_accounts_user_id", table_name="budget_accounts")
    op.drop_index("ix_budget_accounts_id", table_name="budget_accounts")
    op.drop_table("budget_accounts")
