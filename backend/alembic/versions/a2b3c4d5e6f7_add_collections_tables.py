"""add collections and collection_papers tables

Revision ID: a2b3c4d5e6f7
Revises: c1d2e3f4a5b6
Create Date: 2026-04-30 08:30:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "a2b3c4d5e6f7"
down_revision: str | None = "c1d2e3f4a5b6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "collections",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("project_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), server_default=sa.text("''"), nullable=False),
        sa.Column("color", sa.String(length=20), server_default=sa.text("''"), nullable=False),
        sa.Column("sort_order", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("(CURRENT_TIMESTAMP)"), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("(CURRENT_TIMESTAMP)"), nullable=False),
        sa.ForeignKeyConstraint(
            ["project_id"],
            ["projects.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_collections_project_id"), "collections", ["project_id"], unique=False)

    op.create_table(
        "collection_papers",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("collection_id", sa.Integer(), nullable=False),
        sa.Column("paper_id", sa.Integer(), nullable=False),
        sa.Column("added_at", sa.DateTime(), server_default=sa.text("(CURRENT_TIMESTAMP)"), nullable=False),
        sa.ForeignKeyConstraint(
            ["collection_id"],
            ["collections.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["paper_id"],
            ["papers.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_collection_papers_collection_id"), "collection_papers", ["collection_id"], unique=False)
    op.create_index(op.f("ix_collection_papers_paper_id"), "collection_papers", ["paper_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_collection_papers_paper_id"), table_name="collection_papers")
    op.drop_index(op.f("ix_collection_papers_collection_id"), table_name="collection_papers")
    op.drop_table("collection_papers")
    op.drop_index(op.f("ix_collections_project_id"), table_name="collections")
    op.drop_table("collections")
