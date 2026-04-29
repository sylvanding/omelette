"""add_activity_logs_table

Revision ID: a1b2c3d4e5f6
Revises: eed9e0cebcb5
Create Date: 2026-04-29 23:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "a1b2c3d4e5f6"
down_revision: str | Sequence[str] | None = "eed9e0cebcb5"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "activity_logs",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("project_id", sa.Integer(), nullable=False),
        sa.Column("action", sa.String(length=50), nullable=False),
        sa.Column("entity_type", sa.String(length=50), nullable=False),
        sa.Column("entity_id", sa.Integer(), nullable=False),
        sa.Column("actor", sa.String(length=200), server_default="", nullable=False),
        sa.Column("details", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("(CURRENT_TIMESTAMP)"), nullable=False),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_activity_project_created", "activity_logs", ["project_id", "created_at"], unique=False)
    op.create_index(op.f("ix_activity_logs_project_id"), "activity_logs", ["project_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_activity_logs_project_id"), table_name="activity_logs")
    op.drop_index("ix_activity_project_created", table_name="activity_logs")
    op.drop_table("activity_logs")
