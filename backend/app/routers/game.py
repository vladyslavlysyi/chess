"""
Games router: game history and details for authenticated users.
"""
import uuid
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, or_, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.game import Game, GameStatus
from app.schemas.game import GameSummary, GameDetail, GameHistoryResponse
from app.routers.auth import get_current_user

router = APIRouter(prefix="/games", tags=["games"])


@router.get("/history", response_model=GameHistoryResponse)
async def get_my_game_history(
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return paginated game history for the current user."""
    user_id = current_user.id
    where_clause = or_(
        Game.white_player_id == user_id,
        Game.black_player_id == user_id,
    )

    total_result = await db.execute(
        select(func.count(Game.id)).where(where_clause)
    )
    total = total_result.scalar()

    games_result = await db.execute(
        select(Game)
        .where(where_clause)
        .order_by(Game.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    games = games_result.scalars().all()

    return GameHistoryResponse(games=list(games), total=total)


@router.get("/{game_id}", response_model=GameDetail)
async def get_game(
    game_id: uuid.UUID,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get full details (including PGN) for a specific game (authenticated)."""
    result = await db.execute(select(Game).where(Game.id == game_id))
    game = result.scalar_one_or_none()
    if not game:
        raise HTTPException(404, "Game not found")
    return game
