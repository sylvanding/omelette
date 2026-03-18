"""add keyword parent_id index

Revision ID: e7a9b1c3d5f7
Revises: cb8130e58f92
Create Date: 2026-03-18 12:00:00.000000

"""

from collections.abc import Sequence

from alembic import op

revision: str = "e7a9b1c3d5f7"
down_revision: str | Sequence[str] | None = "cb8130e58f92"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_index(op.f("ix_keywords_parent_id"), "keywords", ["parent_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_keywords_parent_id"), table_name="keywords")
