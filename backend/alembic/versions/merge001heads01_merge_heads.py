"""merge_heads_for_single_head

Revision ID: merge001heads01
Revises: d292859d63de, b1c2d3e4f5a6, n0t1f2y3a4t5
Create Date: 2026-05-01 21:40:00.000000

"""

from collections.abc import Sequence

# revision identifiers, used by Alembic.
revision: str = "merge001heads01"
down_revision: str | Sequence[str] | None = ("d292859d63de", "b1c2d3e4f5a6", "n0t1f2y3a4t5")
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Merge migration heads."""
    pass


def downgrade() -> None:
    """No-op for merge."""
    pass
