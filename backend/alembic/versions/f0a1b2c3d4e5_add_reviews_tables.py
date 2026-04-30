"""add reviews and review_extractions tables

Revision ID: f0a1b2c3d4e5
Revises: a2b3c4d5e6f7
Create Date: 2026-04-30 09:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "f0a1b2c3d4e5"
down_revision: str | None = "a2b3c4d5e6f7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "reviews",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("project_id", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(length=500), nullable=False),
        sa.Column("research_question", sa.Text(), server_default=sa.text("''"), nullable=False),
        sa.Column("columns", sa.Text(), server_default=sa.text("'[]'"), nullable=False),
        sa.Column("paper_ids", sa.Text(), server_default=sa.text("'[]'"), nullable=False),
        sa.Column("extraction_status", sa.String(length=50), server_default=sa.text("'pending'"), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("(CURRENT_TIMESTAMP)"), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("(CURRENT_TIMESTAMP)"), nullable=False),
        sa.ForeignKeyConstraint(
            ["project_id"],
            ["projects.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_reviews_project_id"), "reviews", ["project_id"], unique=False)

    op.create_table(
        "review_extractions",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("review_id", sa.Integer(), nullable=False),
        sa.Column("paper_id", sa.Integer(), nullable=False),
        sa.Column("extracted_data", sa.Text(), server_default=sa.text("'{}'"), nullable=False),
        sa.Column("status", sa.String(length=50), server_default=sa.text("'pending'"), nullable=False),
        sa.Column("error_message", sa.Text(), server_default=sa.text("''"), nullable=False),
        sa.Column("confidence", sa.Float(), server_default=sa.text("0"), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("(CURRENT_TIMESTAMP)"), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("(CURRENT_TIMESTAMP)"), nullable=False),
        sa.ForeignKeyConstraint(
            ["review_id"],
            ["reviews.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["paper_id"],
            ["papers.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_review_extractions_review_id"), "review_extractions", ["review_id"], unique=False)
    op.create_index(op.f("ix_review_extractions_paper_id"), "review_extractions", ["paper_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_review_extractions_paper_id"), table_name="review_extractions")
    op.drop_index(op.f("ix_review_extractions_review_id"), table_name="review_extractions")
    op.drop_table("review_extractions")
    op.drop_index(op.f("ix_reviews_project_id"), table_name="reviews")
    op.drop_table("reviews")
