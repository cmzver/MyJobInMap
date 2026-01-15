"""Add address extended tables (systems, equipment, documents, contacts, history)

Revision ID: 20260113_0001
Revises: 
Create Date: 2026-01-13
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '20260113_0001'
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    # Address Systems
    op.create_table(
        'address_systems',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('address_id', sa.Integer(), nullable=False),
        sa.Column('system_type', sa.String(50), nullable=False),
        sa.Column('name', sa.String(200), nullable=False),
        sa.Column('status', sa.String(50), nullable=False, default='active'),
        sa.Column('model', sa.String(200), nullable=True),
        sa.Column('manufacturer', sa.String(200), nullable=True),
        sa.Column('install_date', sa.DateTime(), nullable=True),
        sa.Column('warranty_until', sa.DateTime(), nullable=True),
        sa.Column('last_maintenance', sa.DateTime(), nullable=True),
        sa.Column('next_maintenance', sa.DateTime(), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.func.now(), onupdate=sa.func.now()),
        sa.ForeignKeyConstraint(['address_id'], ['addresses.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_address_systems_address_id', 'address_systems', ['address_id'])
    op.create_index('ix_address_systems_system_type', 'address_systems', ['system_type'])
    
    # Address Equipment
    op.create_table(
        'address_equipment',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('address_id', sa.Integer(), nullable=False),
        sa.Column('system_id', sa.Integer(), nullable=True),
        sa.Column('equipment_type', sa.String(50), nullable=False),
        sa.Column('name', sa.String(200), nullable=False),
        sa.Column('model', sa.String(200), nullable=True),
        sa.Column('serial_number', sa.String(100), nullable=True),
        sa.Column('status', sa.String(50), nullable=False, default='working'),
        sa.Column('quantity', sa.Integer(), nullable=False, default=1),
        sa.Column('location', sa.String(200), nullable=True),
        sa.Column('install_date', sa.DateTime(), nullable=True),
        sa.Column('warranty_until', sa.DateTime(), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.func.now(), onupdate=sa.func.now()),
        sa.ForeignKeyConstraint(['address_id'], ['addresses.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['system_id'], ['address_systems.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_address_equipment_address_id', 'address_equipment', ['address_id'])
    op.create_index('ix_address_equipment_system_id', 'address_equipment', ['system_id'])
    
    # Address Documents
    op.create_table(
        'address_documents',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('address_id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(300), nullable=False),
        sa.Column('doc_type', sa.String(50), nullable=False, default='other'),
        sa.Column('file_path', sa.String(500), nullable=True),
        sa.Column('file_size', sa.Integer(), nullable=True),
        sa.Column('mime_type', sa.String(100), nullable=True),
        sa.Column('valid_from', sa.DateTime(), nullable=True),
        sa.Column('valid_until', sa.DateTime(), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
        sa.Column('created_by_id', sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(['address_id'], ['addresses.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['created_by_id'], ['users.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_address_documents_address_id', 'address_documents', ['address_id'])
    op.create_index('ix_address_documents_doc_type', 'address_documents', ['doc_type'])
    
    # Address Contacts
    op.create_table(
        'address_contacts',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('address_id', sa.Integer(), nullable=False),
        sa.Column('contact_type', sa.String(50), nullable=False, default='other'),
        sa.Column('name', sa.String(200), nullable=False),
        sa.Column('position', sa.String(200), nullable=True),
        sa.Column('phone', sa.String(50), nullable=True),
        sa.Column('email', sa.String(200), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('is_primary', sa.Boolean(), default=False),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.func.now(), onupdate=sa.func.now()),
        sa.ForeignKeyConstraint(['address_id'], ['addresses.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_address_contacts_address_id', 'address_contacts', ['address_id'])
    
    # Address History
    op.create_table(
        'address_history',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('address_id', sa.Integer(), nullable=False),
        sa.Column('event_type', sa.String(50), nullable=False),
        sa.Column('description', sa.Text(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
        sa.ForeignKeyConstraint(['address_id'], ['addresses.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_address_history_address_id', 'address_history', ['address_id'])
    op.create_index('ix_address_history_event_type', 'address_history', ['event_type'])
    op.create_index('ix_address_history_created_at', 'address_history', ['created_at'])
    
    # Add extra_info column to addresses
    op.add_column('addresses', sa.Column('extra_info', sa.Text(), nullable=True))


def downgrade():
    op.drop_column('addresses', 'extra_info')
    op.drop_table('address_history')
    op.drop_table('address_contacts')
    op.drop_table('address_documents')
    op.drop_table('address_equipment')
    op.drop_table('address_systems')
