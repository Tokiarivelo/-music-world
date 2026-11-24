"""users, auth_tokens, sessions, store_templates tables; projects.owner_id

Revision ID: 0003_accounts_templates
Revises: 0002_projects_analyses
"""

import sqlalchemy as sa
from alembic import op

revision = "0003_accounts_templates"
down_revision = "0002_projects_analyses"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.Uuid(as_uuid=False), primary_key=True),
        sa.Column("email", sa.String(254), nullable=False, unique=True),
        sa.Column("display_name", sa.String(40), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_table(
        "auth_tokens",
        sa.Column("token_hash", sa.String(64), primary_key=True),
        sa.Column("email", sa.String(254), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_table(
        "sessions",
        sa.Column("token_hash", sa.String(64), primary_key=True),
        sa.Column("user_id", sa.Uuid(as_uuid=False), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_sessions_user_id", "sessions", ["user_id"])
    op.add_column("projects", sa.Column("owner_id", sa.Uuid(as_uuid=False), nullable=True))
    op.create_index("ix_projects_owner_id", "projects", ["owner_id"])
    op.create_table(
        "store_templates",
        sa.Column("id", sa.Uuid(as_uuid=False), primary_key=True),
        sa.Column("owner_id", sa.Uuid(as_uuid=False), nullable=False),
        sa.Column("template_id", sa.String(60), nullable=False, unique=True),
        sa.Column("author_name", sa.String(40), nullable=False),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("document", sa.JSON(), nullable=False),
        sa.Column("thumbnail_key", sa.String(200), nullable=True),
        sa.Column("thumbnail_type", sa.String(32), nullable=True),
        sa.Column("report_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_store_templates_owner_id", "store_templates", ["owner_id"])
    op.create_index("ix_store_templates_status_published", "store_templates", ["status", "published_at"])


def downgrade() -> None:
    op.drop_index("ix_store_templates_status_published", table_name="store_templates")
    op.drop_index("ix_store_templates_owner_id", table_name="store_templates")
    op.drop_table("store_templates")
    op.drop_index("ix_projects_owner_id", table_name="projects")
    op.drop_column("projects", "owner_id")
    op.drop_index("ix_sessions_user_id", table_name="sessions")
    op.drop_table("sessions")
    op.drop_table("auth_tokens")
    op.drop_table("users")
