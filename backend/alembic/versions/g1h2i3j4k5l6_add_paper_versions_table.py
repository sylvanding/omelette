"""add paper_versions table

Revision ID: g1h2i3j4k5l6
Revises: f0a1b2c3d4e5
Create Date: 2026-04-30
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "g1h2i3j4k5l6"
down_revision: str | None = "f0a1b2c3d4e5"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "paper_versions",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("paper_id", sa.Integer(), nullable=False, index=True),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("source", sa.String(50), nullable=False),
        sa.Column("doi", sa.String(255), index=True),
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column("abstract", sa.Text(), server_default=""),
        sa.Column("authors", sa.JSON(), nullable=True),
        sa.Column("journal", sa.String(500), server_default=""),
        sa.Column("year", sa.Integer(), nullable=True),
        sa.Column("citation_count", sa.Integer(), server_default="0"),
        sa.Column("pdf_url", sa.Text(), nullable=True),
        sa.Column("is_preprint", sa.Boolean(), server_default="1"),
        sa.Column("preprint_server", sa.String(100), nullable=True),
        sa.Column("diff_summary", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["paper_id"], ["papers.id"], ondelete="CASCADE"),
    )


def downgrade() -> None:
    op.drop_table("paper_versions")
