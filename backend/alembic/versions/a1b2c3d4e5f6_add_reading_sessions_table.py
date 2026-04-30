"""add reading_sessions table

Revision ID: a1b2c3d4e5f6
Revises: f0a1b2c3d4e5
Create Date: 2026-04-30 10:30:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "a1b2c3d4e5f6"
down_revision: str | None = "f0a1b2c3d4e5"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "reading_sessions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("paper_id", sa.Integer(), nullable=False),
        sa.Column("started_at", sa.DateTime(), nullable=False),
        sa.Column("ended_at", sa.DateTime(), nullable=False),
        sa.Column("time_spent_seconds", sa.Integer(), nullable=False),
        sa.Column("pages_read", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.ForeignKeyConstraint(["paper_id"], ["papers.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_reading_session_paper", "reading_sessions", ["paper_id"])
    op.create_index("ix_reading_session_paper_started", "reading_sessions", ["paper_id", "started_at"])


def downgrade() -> None:
    op.drop_index("ix_reading_session_paper_started", table_name="reading_sessions")
    op.drop_index("ix_reading_session_paper", table_name="reading_sessions")
    op.drop_table("reading_sessions")
