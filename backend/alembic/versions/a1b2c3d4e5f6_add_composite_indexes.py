"""add composite indexes for paper and task tables

Revision ID: a1b2c3d4e5f6
Revises: f2bee250c39f
Create Date: 2026-03-18 10:00:00.000000

"""

from collections.abc import Sequence

from alembic import op

revision: str = "a1b2c3d4e5f6"
down_revision: str | None = "f2bee250c39f"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_index("ix_paper_project_status", "papers", ["project_id", "status"])
    op.create_index("ix_task_project_status", "tasks", ["project_id", "status"])


def downgrade() -> None:
    op.drop_index("ix_task_project_status", table_name="tasks")
    op.drop_index("ix_paper_project_status", table_name="papers")
