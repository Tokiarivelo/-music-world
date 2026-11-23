"""projects and analyses tables, jobs.subject_id

Revision ID: 0002_projects_analyses
Revises: 0001_jobs
"""

import sqlalchemy as sa
from alembic import op

revision = "0002_projects_analyses"
down_revision = "0001_jobs"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("jobs", sa.Column("subject_id", sa.Uuid(as_uuid=False), nullable=True))
    op.create_table(
        "projects",
        sa.Column("id", sa.Uuid(as_uuid=False), primary_key=True),
        sa.Column("audio_hash", sa.String(71), nullable=False),
        sa.Column("audio_key", sa.String(200), nullable=False),
        sa.Column("audio_format", sa.String(8), nullable=False),
        sa.Column("duration_sec", sa.Float(), nullable=False),
        sa.Column("lrc_text", sa.Text(), nullable=True),
        sa.Column("job_id", sa.Uuid(as_uuid=False), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_projects_audio_hash", "projects", ["audio_hash"])
    op.create_table(
        "analyses",
        sa.Column("audio_hash", sa.String(71), primary_key=True),
        sa.Column("schema_id", sa.String(64), nullable=False),
        sa.Column("result", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("analyses")
    op.drop_index("ix_projects_audio_hash", table_name="projects")
    op.drop_table("projects")
    op.drop_column("jobs", "subject_id")
