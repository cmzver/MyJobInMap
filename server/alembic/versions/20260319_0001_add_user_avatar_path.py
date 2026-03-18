"""Add user avatar_path column

Revision ID: 20260319_0001
Revises: 20260317_0001
Create Date: 2026-03-19
"""

from alembic import op
import sqlalchemy as sa


revision = '20260319_0001'
down_revision = '20260317_0001'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('users', sa.Column('avatar_path', sa.String(length=500), nullable=True))


def downgrade():
    op.drop_column('users', 'avatar_path')