"""projects.edits_json: the owner's note edits (11-editable-notes)

Revision ID: 0006_project_edits
Revises: 0005_moderation
"""

import sqlalchemy as sa
from alembic import op

revision = "0006_project_edits"
down_revision = "0005_moderation"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("projects", sa.Column("edits_json", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("projects", "edits_json")
