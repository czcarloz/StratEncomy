"""portfolio goals

Revision ID: c3d4e5f6a7b8
Revises: b2c3d4e5f6a7
Create Date: 2026-05-18 00:01:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "c3d4e5f6a7b8"
down_revision: Union[str, None] = "b2c3d4e5f6a7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "portfolio_goals",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("portfolio_id", sa.Integer(), sa.ForeignKey("portfolios.id"), nullable=False, index=True),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id"), nullable=False, index=True),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("patrimony_target", sa.Numeric(18, 2), nullable=True),
        sa.Column("dividends_target", sa.Numeric(18, 2), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.execute("ALTER TABLE portfolio_goals ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE portfolio_goals FORCE ROW LEVEL SECURITY")
    op.execute("""
        CREATE POLICY portfolio_goals_tenant_isolation ON portfolio_goals
        USING (
            current_setting('app.current_role', TRUE) = 'admin'
            OR tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::INT
        )
    """)


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS portfolio_goals_tenant_isolation ON portfolio_goals")
    op.drop_table("portfolio_goals")
