"""songs: the catalog of seeded songs (title, artist, licence, link to the project and its analysis)

Revision ID: 0007_songs_catalog
Revises: 0006_project_edits
"""

import sqlalchemy as sa
from alembic import op

revision = "0007_songs_catalog"
down_revision = "0006_project_edits"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "songs",
        sa.Column("id", sa.Uuid(as_uuid=False), primary_key=True),
        sa.Column("slug", sa.String(80), nullable=False),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("artist", sa.String(200), nullable=False),
        sa.Column("license", sa.String(120), nullable=False),
        sa.Column("source_url", sa.String(400), nullable=True),
        # false for a recording that may be used locally but must never be listed or shipped (all rights reserved)
        sa.Column("is_public", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("audio_hash", sa.String(71), nullable=False),
        sa.Column("audio_key", sa.String(200), nullable=False),
        sa.Column("audio_format", sa.String(8), nullable=False),
        sa.Column("duration_sec", sa.Float(), nullable=False),
        sa.Column("project_id", sa.Uuid(as_uuid=False), nullable=True),
        # copied from the analysis for listing without reading its JSON
        sa.Column("musical_key", sa.String(32), nullable=True),
        sa.Column("tempo_bpm", sa.Float(), nullable=True),
        sa.Column("note_count", sa.Integer(), nullable=True),
        sa.Column("pipeline_version", sa.String(32), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ux_songs_slug", "songs", ["slug"], unique=True)
    op.create_index("ux_songs_audio_hash", "songs", ["audio_hash"], unique=True)


def downgrade() -> None:
    op.drop_index("ux_songs_audio_hash", table_name="songs")
    op.drop_index("ux_songs_slug", table_name="songs")
    op.drop_table("songs")
