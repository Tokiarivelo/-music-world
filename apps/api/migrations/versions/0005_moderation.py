"""moderation_actions table and store_templates.reports_since (10-template-moderation)

Revision ID: 0005_moderation
Revises: 0004_template_reports
"""

import sqlalchemy as sa
from alembic import op

revision = "0005_moderation"
down_revision = "0004_template_reports"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("store_templates", sa.Column("reports_since", sa.DateTime(timezone=True), nullable=True))
    op.create_table(
        "moderation_actions",
        sa.Column("id", sa.Uuid(as_uuid=False), primary_key=True),
        sa.Column("template_id", sa.Uuid(as_uuid=False), nullable=False),
        sa.Column("moderator_id", sa.Uuid(as_uuid=False), nullable=False),
        sa.Column("action", sa.String(16), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_moderation_actions_template_id", "moderation_actions", ["template_id"])


def downgrade() -> None:
    op.drop_index("ix_moderation_actions_template_id", table_name="moderation_actions")
    op.drop_table("moderation_actions")
    op.drop_column("store_templates", "reports_since")
