"""planned_investment: add portfolio_id

Revision ID: f6a7b8c9d0e1
Revises: e5f6a7b8c9d0
Create Date: 2026-05-23
"""
from alembic import op
import sqlalchemy as sa

revision = "f6a7b8c9d0e1"
down_revision = "e5f6a7b8c9d0"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "planned_investments",
        sa.Column("portfolio_id", sa.Integer(), nullable=True),
    )
    op.create_foreign_key(
        "fk_planned_investments_portfolio",
        "planned_investments", "portfolios",
        ["portfolio_id"], ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_planned_investments_portfolio_id", "planned_investments", ["portfolio_id"])


def downgrade() -> None:
    op.drop_index("ix_planned_investments_portfolio_id", "planned_investments")
    op.drop_constraint("fk_planned_investments_portfolio", "planned_investments", type_="foreignkey")
    op.drop_column("planned_investments", "portfolio_id")
