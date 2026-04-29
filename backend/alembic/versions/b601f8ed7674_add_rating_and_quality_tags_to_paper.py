"""add_rating_and_quality_tags_to_paper

Revision ID: b601f8ed7674
Revises:
Create Date: 2026-04-29 22:33:24.781589

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "b601f8ed7674"
down_revision: str | Sequence[str] | None = "eed9e0cebcb5"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column("papers", sa.Column("rating", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("papers", sa.Column("quality_tags", sa.JSON(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("papers", "quality_tags")
    op.drop_column("papers", "rating")
