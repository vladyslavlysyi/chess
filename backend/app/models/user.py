import uuid
from datetime import datetime
from sqlalchemy import String, Integer, Float, Boolean, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True, default=uuid.uuid4
    )
    username: Mapped[str] = mapped_column(String(32), unique=True, nullable=False, index=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    password_hash: Mapped[str] = mapped_column(String(128), nullable=False)

    # ELO ratings per time control
    elo_rapid: Mapped[int] = mapped_column(Integer, default=1200, nullable=False)
    elo_blitz: Mapped[int] = mapped_column(Integer, default=1200, nullable=False)
    elo_bullet: Mapped[int] = mapped_column(Integer, default=1200, nullable=False)

    # Glicko-2 deviation (for rating reliability)
    rd_rapid: Mapped[float] = mapped_column(Float, default=350.0)
    rd_blitz: Mapped[float] = mapped_column(Float, default=350.0)
    rd_bullet: Mapped[float] = mapped_column(Float, default=350.0)

    # Stats
    wins: Mapped[int] = mapped_column(Integer, default=0)
    losses: Mapped[int] = mapped_column(Integer, default=0)
    draws: Mapped[int] = mapped_column(Integer, default=0)

    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    last_seen: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    def __repr__(self) -> str:
        return f"<User {self.username} elo={self.elo_rapid}>"
