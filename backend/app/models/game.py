import uuid
from datetime import datetime
from typing import Optional
from sqlalchemy import String, Integer, Boolean, DateTime, ForeignKey, Enum, Text, func
from sqlalchemy.orm import Mapped, mapped_column
import enum
from app.database import Base


class GameStatus(str, enum.Enum):
    WAITING = "waiting"
    IN_PROGRESS = "in_progress"
    WHITE_WON = "white_won"
    BLACK_WON = "black_won"
    DRAW = "draw"
    ABORTED = "aborted"


class TimeControl(str, enum.Enum):
    BULLET_1_0 = "1+0"
    BULLET_2_1 = "2+1"
    BLITZ_3_0 = "3+0"
    BLITZ_3_2 = "3+2"
    BLITZ_5_0 = "5+0"
    BLITZ_5_3 = "5+3"
    RAPID_10_0 = "10+0"
    RAPID_10_5 = "10+5"
    RAPID_15_10 = "15+10"


class Game(Base):
    __tablename__ = "games"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)

    # Players (nullable for guests)
    white_player_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    black_player_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )

    # Guest display names (used when player_id is null)
    white_display_name: Mapped[str] = mapped_column(String(64), default="Guest")
    black_display_name: Mapped[str] = mapped_column(String(64), default="Guest")

    is_rated: Mapped[bool] = mapped_column(Boolean, default=False)
    is_vs_bot: Mapped[bool] = mapped_column(Boolean, default=False)
    bot_level: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)  # 0-20

    status: Mapped[GameStatus] = mapped_column(
        Enum(GameStatus), default=GameStatus.WAITING, nullable=False, index=True
    )

    time_control: Mapped[TimeControl] = mapped_column(
        Enum(TimeControl), default=TimeControl.RAPID_10_0, nullable=False
    )

    # Full PGN string stored after game ends
    pgn: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    winner_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    # ELO at the time of the game (snapshot)
    white_elo_before: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    black_elo_before: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    white_elo_after: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    black_elo_after: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )
    ended_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    def __repr__(self) -> str:
        return f"<Game {self.id} {self.status}>"
