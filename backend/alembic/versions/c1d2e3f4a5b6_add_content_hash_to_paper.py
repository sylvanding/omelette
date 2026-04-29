"""add content_hash column to paper table

Revision ID: c1d2e3f4a5b6
Revises: 37aec63cf80d
Create Date: 2026-04-30 02:15:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "c1d2e3f4a5b6"
down_revision: str | None = "37aec63cf80d"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("papers", sa.Column("content_hash", sa.String(64), nullable=True, default=None))
    op.create_index("ix_paper_content_hash", "papers", ["content_hash"])


def downgrade() -> None:
    op.drop_index("ix_paper_content_hash", table_name="papers")
    op.drop_column("papers", "content_hash")
