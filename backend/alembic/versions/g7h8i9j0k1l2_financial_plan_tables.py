"""financial plan: config, phases, goals

Revision ID: g7h8i9j0k1l2
Revises: f6a7b8c9d0e1
Create Date: 2026-05-23
"""
from alembic import op
import sqlalchemy as sa

revision = "g7h8i9j0k1l2"
down_revision = "f6a7b8c9d0e1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "financial_plan_configs",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id"), nullable=False, unique=True),
        sa.Column("initial_patrimony", sa.Numeric(18, 2), nullable=False, server_default="0"),
        sa.Column("monthly_rate", sa.Numeric(8, 6), nullable=False, server_default="0.010000"),
        sa.Column("horizon_years", sa.SmallInteger(), nullable=False, server_default="3"),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_financial_plan_configs_tenant_id", "financial_plan_configs", ["tenant_id"])

    op.create_table(
        "financial_plan_phases",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("start_year", sa.SmallInteger(), nullable=False),
        sa.Column("start_month", sa.SmallInteger(), nullable=False),
        sa.Column("salary", sa.Numeric(12, 2), nullable=False),
        sa.Column("aporte", sa.Numeric(12, 2), nullable=False),
        sa.Column("gasto_maximo", sa.Numeric(12, 2), nullable=False),
        sa.Column("note", sa.String(200), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_financial_plan_phases_tenant_id", "financial_plan_phases", ["tenant_id"])

    op.create_table(
        "financial_goals",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id"), nullable=False),
        sa.Column("description", sa.String(200), nullable=False),
        sa.Column("target_date", sa.Date(), nullable=False),
        sa.Column("target_amount", sa.Numeric(18, 2), nullable=False),
        sa.Column("actual_amount", sa.Numeric(18, 2), nullable=True),
        sa.Column("note", sa.String(500), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_financial_goals_tenant_id", "financial_goals", ["tenant_id"])


def downgrade() -> None:
    op.drop_table("financial_goals")
    op.drop_table("financial_plan_phases")
    op.drop_table("financial_plan_configs")
