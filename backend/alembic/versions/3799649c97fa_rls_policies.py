"""rls policies

Revision ID: 3799649c97fa
Revises: cdcff0220a6f
Create Date: 2026-05-17 23:00:01.778806

"""
from typing import Sequence, Union

from alembic import op

revision: str = '3799649c97fa'
down_revision: Union[str, Sequence[str], None] = 'cdcff0220a6f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Protect user_tenant_access: users only see their own rows; admins see all.
    op.execute("ALTER TABLE user_tenant_access ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE user_tenant_access FORCE ROW LEVEL SECURITY")
    op.execute("""
        CREATE POLICY uta_isolation ON user_tenant_access
        USING (
            current_setting('app.current_role', TRUE) = 'admin'
            OR user_id = NULLIF(current_setting('app.current_user_id', TRUE), '')::INT
        )
    """)

    # Helper function: sets user + role + tenant context for the current session.
    # Called by the backend on every authenticated request before any query.
    op.execute("""
        CREATE OR REPLACE FUNCTION set_user_context(p_user_id INT, p_role TEXT, p_tenant_id INT)
        RETURNS VOID LANGUAGE plpgsql AS $$
        BEGIN
            PERFORM set_config('app.current_user_id',  p_user_id::TEXT,  TRUE);
            PERFORM set_config('app.current_role',      p_role,           TRUE);
            PERFORM set_config('app.current_tenant_id', COALESCE(p_tenant_id::TEXT, ''), TRUE);
        END;
        $$
    """)


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS uta_isolation ON user_tenant_access")
    op.execute("ALTER TABLE user_tenant_access DISABLE ROW LEVEL SECURITY")
    op.execute("DROP FUNCTION IF EXISTS set_user_context(INT, TEXT, INT)")
