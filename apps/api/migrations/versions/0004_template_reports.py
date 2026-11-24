"""template_reports table (one report per user and store template)

Revision ID: 0004_template_reports
Revises: 0003_accounts_templates
"""

import sqlalchemy as sa
from alembic import op

revision = "0004_template_reports"
down_revision = "0003_accounts_templates"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "template_reports",
        sa.Column("template_id", sa.Uuid(as_uuid=False), primary_key=True),
        sa.Column("user_id", sa.Uuid(as_uuid=False), primary_key=True),
        sa.Column("reason", sa.String(16), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("template_reports")
