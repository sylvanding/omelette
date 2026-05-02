"""add audio_overviews table

Revision ID: h1a2u3d4i5o6
Revises: g1h2i3j4k5l6
Create Date: 2026-05-01 08:30:00
"""

import sqlalchemy as sa
from alembic import op

revision = "h1a2u3d4i5o6"
down_revision = "g1h2i3j4k5l6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "audio_overviews",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "project_id", sa.Integer(), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True
        ),
        sa.Column("title", sa.String(255), nullable=False, server_default=""),
        sa.Column("summary", sa.Text(), nullable=False, server_default=""),
        sa.Column("duration_estimate", sa.String(50), nullable=False, server_default=""),
        sa.Column("tone", sa.String(20), nullable=False, server_default="conversational"),
        sa.Column("focus_areas", sa.String(500), nullable=False, server_default="[]"),
        sa.Column("paper_ids", sa.String(500), nullable=False, server_default="[]"),
        sa.Column("paper_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("avg_confidence", sa.Float(), nullable=False, server_default="0.0"),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table("audio_overviews")
