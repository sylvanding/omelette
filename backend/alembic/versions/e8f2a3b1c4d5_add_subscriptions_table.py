"""add subscriptions table

Revision ID: e8f2a3b1c4d5
Revises: d409bcf884d8
Create Date: 2026-03-11

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "e8f2a3b1c4d5"
down_revision: str | Sequence[str] | None = "d409bcf884d8"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "subscriptions",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("project_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("query", sa.Text(), server_default=sa.text("''"), nullable=False),
        sa.Column("sources", sa.JSON(), nullable=True),
        sa.Column("frequency", sa.String(length=20), server_default=sa.text("'weekly'"), nullable=False),
        sa.Column("max_results", sa.Integer(), server_default=sa.text("50"), nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("1"), nullable=False),
        sa.Column("last_run_at", sa.DateTime(), nullable=True),
        sa.Column("total_found", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("(CURRENT_TIMESTAMP)"), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("(CURRENT_TIMESTAMP)"), nullable=False),
        sa.ForeignKeyConstraint(
            ["project_id"],
            ["projects.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_subscriptions_project_id"), "subscriptions", ["project_id"], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f("ix_subscriptions_project_id"), table_name="subscriptions")
    op.drop_table("subscriptions")
