"""add_reading_status_fields_to_paper

Revision ID: eed9e0cebcb5
Revises: e7a9b1c3d5f7
Create Date: 2026-04-29 22:02:17.226295

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "eed9e0cebcb5"
down_revision: str | Sequence[str] | None = "a1b2c3d4e5f6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        "papers",
        sa.Column("reading_status", sa.String(length=20), server_default=sa.text("'unread'"), nullable=False),
    )
    op.add_column("papers", sa.Column("read_at", sa.DateTime(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("papers", "read_at")
    op.drop_column("papers", "reading_status")
