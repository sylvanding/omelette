"""merge_all_heads

Revision ID: 37aec63cf80d
Revises: b601f8ed7674, e7a9b1c3d5f7, 9a1b2c3d4e5f6
Create Date: 2026-04-29 23:48:53.747935

"""

from collections.abc import Sequence

# revision identifiers, used by Alembic.
revision: str = "37aec63cf80d"
down_revision: str | Sequence[str] | None = ("b601f8ed7674", "e7a9b1c3d5f7", "9a1b2c3d4e5f6")
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
