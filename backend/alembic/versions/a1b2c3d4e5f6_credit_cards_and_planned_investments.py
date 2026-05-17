"""credit cards and planned investments

Revision ID: a1b2c3d4e5f6
Revises: 9b7ec20798cb
Create Date: 2026-05-17 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "a1b2c3d4e5f6"
down_revision: Union[str, None] = "9b7ec20798cb"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "credit_cards",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("closing_day", sa.SmallInteger(), nullable=False),
        sa.Column("due_day", sa.SmallInteger(), nullable=False),
        sa.Column("limit", sa.Numeric(12, 2), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index("ix_credit_cards_tenant_id", "credit_cards", ["tenant_id"])

    op.create_table(
        "credit_card_purchases",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("card_id", sa.Integer(), sa.ForeignKey("credit_cards.id"), nullable=False),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("description", sa.String(500), nullable=False),
        sa.Column("total_amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("installments", sa.SmallInteger(), nullable=False, server_default="1"),
        sa.Column("purchase_date", sa.Date(), nullable=False),
        sa.Column("created_by", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index("ix_credit_card_purchases_card_id", "credit_card_purchases", ["card_id"])
    op.create_index("ix_credit_card_purchases_tenant_id", "credit_card_purchases", ["tenant_id"])
    op.create_index("ix_credit_card_purchases_purchase_date", "credit_card_purchases", ["purchase_date"])

    op.create_table(
        "planned_investments",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("month", sa.SmallInteger(), nullable=False),
        sa.Column("year", sa.SmallInteger(), nullable=False),
        sa.Column("asset_label", sa.String(200), nullable=False),
        sa.Column("amount_planned", sa.Numeric(12, 2), nullable=False),
        sa.Column("note", sa.String(500), nullable=True),
        sa.Column("created_by", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index("ix_planned_investments_tenant_id", "planned_investments", ["tenant_id"])
    op.create_index(
        "ix_planned_investments_tenant_month_year",
        "planned_investments",
        ["tenant_id", "month", "year"],
    )

    # RLS on credit_cards
    op.execute("ALTER TABLE credit_cards ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE credit_cards FORCE ROW LEVEL SECURITY")
    op.execute("""
        CREATE POLICY cc_tenant_isolation ON credit_cards
        USING (tenant_id = current_setting('app.tenant_id', true)::int
               OR current_setting('app.role', true) = 'admin')
    """)

    # RLS on credit_card_purchases
    op.execute("ALTER TABLE credit_card_purchases ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE credit_card_purchases FORCE ROW LEVEL SECURITY")
    op.execute("""
        CREATE POLICY ccp_tenant_isolation ON credit_card_purchases
        USING (tenant_id = current_setting('app.tenant_id', true)::int
               OR current_setting('app.role', true) = 'admin')
    """)

    # RLS on planned_investments
    op.execute("ALTER TABLE planned_investments ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE planned_investments FORCE ROW LEVEL SECURITY")
    op.execute("""
        CREATE POLICY pi_tenant_isolation ON planned_investments
        USING (tenant_id = current_setting('app.tenant_id', true)::int
               OR current_setting('app.role', true) = 'admin')
    """)


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS pi_tenant_isolation ON planned_investments")
    op.execute("DROP POLICY IF EXISTS ccp_tenant_isolation ON credit_card_purchases")
    op.execute("DROP POLICY IF EXISTS cc_tenant_isolation ON credit_cards")
    op.drop_table("planned_investments")
    op.drop_table("credit_card_purchases")
    op.drop_table("credit_cards")
