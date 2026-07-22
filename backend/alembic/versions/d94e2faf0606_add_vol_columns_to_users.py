"""add_vol_columns_to_users

Adds Glicko-2 volatility (sigma) columns to the users table.
These columns were present in the SQLAlchemy model but missing from the DB
because create_all_tables() does not ALTER existing tables.

Revision ID: d94e2faf0606
Revises:
Create Date: 2026-07-22 19:39:55.862351

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd94e2faf0606'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('users', sa.Column('vol_rapid', sa.Float(), nullable=False, server_default='0.06'))
    op.add_column('users', sa.Column('vol_blitz', sa.Float(), nullable=False, server_default='0.06'))
    op.add_column('users', sa.Column('vol_bullet', sa.Float(), nullable=False, server_default='0.06'))


def downgrade() -> None:
    op.drop_column('users', 'vol_bullet')
    op.drop_column('users', 'vol_blitz')
    op.drop_column('users', 'vol_rapid')
