import uuid
from datetime import datetime
from typing import Optional
from pydantic import BaseModel
from app.models.game import GameStatus, TimeControl


class GameSummary(BaseModel):
    id: uuid.UUID
    white_display_name: str
    black_display_name: str
    status: GameStatus
    time_control: TimeControl
    is_rated: bool
    white_elo_before: Optional[int]
    black_elo_before: Optional[int]
    white_elo_after: Optional[int]
    black_elo_after: Optional[int]
    created_at: datetime
    ended_at: Optional[datetime]

    model_config = {"from_attributes": True}


class GameDetail(GameSummary):
    pgn: Optional[str]

    model_config = {"from_attributes": True}


class GameHistoryResponse(BaseModel):
    games: list[GameSummary]
    total: int
