"""add paper project_doi unique constraint

Revision ID: cb8130e58f92
Revises: a1b2c3d4e5f6
Create Date: 2026-03-18 22:54:13.519198

"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "cb8130e58f92"
down_revision: str | Sequence[str] | None = "a1b2c3d4e5f6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    with op.batch_alter_table("papers", schema=None) as batch_op:
        batch_op.create_unique_constraint("uq_paper_project_doi", ["project_id", "doi"])


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table("papers", schema=None) as batch_op:
        batch_op.drop_constraint("uq_paper_project_doi", type_="unique")
