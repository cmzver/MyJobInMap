"""Clear automatically detected duplicates.

Снимала автоматические дубли и пересчитывала возвраты. С 20261101_0003
повторы и дубли отмечают только вручную, а та миграция снимает всё, что
поставила автоматика, — здесь больше нечего делать.

Revision ID: 20261101_0002
Revises: 20261101_0001
Create Date: 2026-11-01
"""

revision = "20261101_0002"
down_revision = "20261101_0001"
branch_labels = None
depends_on = None


def upgrade():
    pass


def downgrade():
    pass
