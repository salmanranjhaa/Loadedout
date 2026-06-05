"""add_exercises_table

Revision ID: d74115dd9064
Revises: 3a4b5c6d7e8f
Create Date: 2026-05-05 10:09:53.604191

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'd74115dd9064'
down_revision: Union[str, None] = '3a4b5c6d7e8f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('exercises',
        sa.Column('id', sa.String(length=80), nullable=False),
        sa.Column('name', sa.String(length=120), nullable=False),
        sa.Column('body_part', sa.String(length=50), nullable=True),
        sa.Column('equipment', sa.String(length=50), nullable=True),
        sa.Column('primary_muscles', sa.JSON(), nullable=True),
        sa.Column('secondary_muscles', sa.JSON(), nullable=True),
        sa.Column('instructions', sa.JSON(), nullable=True),
        sa.Column('image_start_url', sa.String(length=255), nullable=True),
        sa.Column('image_end_url', sa.String(length=255), nullable=True),
        sa.Column('category', sa.String(length=30), nullable=True),
        sa.Column('level', sa.String(length=20), nullable=True),
        sa.Column('force', sa.String(length=20), nullable=True),
        sa.Column('mechanic', sa.String(length=20), nullable=True),
        sa.Column('llm_description', sa.Text(), nullable=True),
        sa.Column('llm_enriched_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_exercises_body_part'), 'exercises', ['body_part'], unique=False)
    op.create_index(op.f('ix_exercises_equipment'), 'exercises', ['equipment'], unique=False)
    op.create_index(op.f('ix_exercises_id'), 'exercises', ['id'], unique=False)
    op.create_index(op.f('ix_exercises_name'), 'exercises', ['name'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_exercises_name'), table_name='exercises')
    op.drop_index(op.f('ix_exercises_id'), table_name='exercises')
    op.drop_index(op.f('ix_exercises_equipment'), table_name='exercises')
    op.drop_index(op.f('ix_exercises_body_part'), table_name='exercises')
    op.drop_table('exercises')
