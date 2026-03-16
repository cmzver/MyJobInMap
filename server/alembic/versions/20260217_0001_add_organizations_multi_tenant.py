"""Add organizations table and organization_id to users, tasks, addresses

Revision ID: 20260217_0001
Revises: 20260113_0001
Create Date: 2026-02-17

Multi-tenant support: Добавляет таблицу organizations и FK organization_id
к users, tasks и addresses для изоляции данных между организациями.

Все FK nullable=True для обратной совместимости (существующие записи
остаются без организации, т.е. доступны суперадмину).
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '20260217_0001'
down_revision = '20260113_0001'
branch_labels = None
depends_on = None


def upgrade():
    # 1. Создать таблицу organizations
    op.create_table(
        'organizations',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(200), nullable=False),
        sa.Column('slug', sa.String(100), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('email', sa.String(200), nullable=True),
        sa.Column('phone', sa.String(50), nullable=True),
        sa.Column('address', sa.String(500), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='1'),
        sa.Column('max_users', sa.Integer(), nullable=False, server_default='50'),
        sa.Column('max_tasks', sa.Integer(), nullable=False, server_default='10000'),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_organizations_name', 'organizations', ['name'], unique=True)
    op.create_index('ix_organizations_slug', 'organizations', ['slug'], unique=True)

    # 2. Добавить organization_id к users
    op.add_column('users', sa.Column('organization_id', sa.Integer(), nullable=True))
    op.create_foreign_key(
        'fk_users_organization_id', 'users', 'organizations',
        ['organization_id'], ['id']
    )
    op.create_index('ix_users_organization_id', 'users', ['organization_id'])

    # 3. Добавить organization_id к tasks
    op.add_column('tasks', sa.Column('organization_id', sa.Integer(), nullable=True))
    op.create_foreign_key(
        'fk_tasks_organization_id', 'tasks', 'organizations',
        ['organization_id'], ['id']
    )
    op.create_index('ix_tasks_organization_id', 'tasks', ['organization_id'])

    # 4. Добавить organization_id к addresses
    op.add_column('addresses', sa.Column('organization_id', sa.Integer(), nullable=True))
    op.create_foreign_key(
        'fk_addresses_organization_id', 'addresses', 'organizations',
        ['organization_id'], ['id']
    )
    op.create_index('ix_addresses_organization_id', 'addresses', ['organization_id'])


def downgrade():
    # 4. Откатить addresses
    op.drop_index('ix_addresses_organization_id', table_name='addresses')
    op.drop_constraint('fk_addresses_organization_id', 'addresses', type_='foreignkey')
    op.drop_column('addresses', 'organization_id')

    # 3. Откатить tasks
    op.drop_index('ix_tasks_organization_id', table_name='tasks')
    op.drop_constraint('fk_tasks_organization_id', 'tasks', type_='foreignkey')
    op.drop_column('tasks', 'organization_id')

    # 2. Откатить users
    op.drop_index('ix_users_organization_id', table_name='users')
    op.drop_constraint('fk_users_organization_id', 'users', type_='foreignkey')
    op.drop_column('users', 'organization_id')

    # 1. Удалить таблицу organizations
    op.drop_index('ix_organizations_slug', table_name='organizations')
    op.drop_index('ix_organizations_name', table_name='organizations')
    op.drop_table('organizations')
