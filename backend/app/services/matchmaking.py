"""
Matchmaking Service using Redis Sorted Sets.

Architecture:
  - Each time control has its own queue (sorted set).
  - Key pattern: "queue:{time_control}:{mode}" (e.g., "queue:10+0:rated")
  - Score = player's ELO rating (allows efficient range queries for fair matching).
  - A background asyncio.Task scans queues every 1 second and creates matches.

ELO-based matching:
  - Initially looks for opponent within ±100 ELO.
  - After 10s: expands to ±200.
  - After 30s: expands to ±500 (any player at same time control).
"""
import asyncio
import json
import logging
import uuid
from dataclasses import dataclass
from typing import Optional

import redis.asyncio as aioredis

from app.config import get_settings
from app.services.game_service import GameSession, PlayerInfo, active_sessions
from app.ws.manager import manager
from app.ws import protocol as proto

settings = get_settings()
logger = logging.getLogger(__name__)

QUEUE_POLL_INTERVAL = 1.0  # seconds
INITIAL_ELO_WINDOW = 100
MAX_ELO_WINDOW = 500
WINDOW_EXPAND_STEP = 100
WINDOW_EXPAND_EVERY = 10  # seconds


@dataclass
class QueueEntry:
    user_id: Optional[str]  # None for guests
    display_name: str
    elo: int
    time_control: str
    mode: str  # "rated" | "casual"
    ws_key: str  # unique key to find the WebSocket in manager
    joined_at: float


class MatchmakingService:
    def __init__(self):
        self._redis: Optional[aioredis.Redis] = None
        self._task: Optional[asyncio.Task] = None

    async def start(self):
        """Initialize Redis connection and start background matchmaking loop."""
        self._redis = await aioredis.from_url(
            settings.REDIS_URL, decode_responses=True
        )
        self._task = asyncio.create_task(self._run_loop())
        logger.info("✅ Matchmaking service started")

    async def stop(self):
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
            self._task = None
        if self._redis:
            await self._redis.aclose()
            self._redis = None

    def _queue_key(self, time_control: str, mode: str) -> str:
        return f"queue:{time_control}:{mode}"

    def _entry_key(self, user_key: str) -> str:
        return f"entry:{user_key}"

    async def enqueue(
        self,
        user_id: Optional[uuid.UUID],
        display_name: str,
        elo: int,
        time_control: str,
        mode: str,  # "rated" | "casual"
        ws_key: str,
    ) -> int:
        """Add a player to the matchmaking queue. Returns queue position."""
        import time
        entry = QueueEntry(
            user_id=str(user_id) if user_id else None,
            display_name=display_name,
            elo=elo,
            time_control=time_control,
            mode=mode,
            ws_key=ws_key,
            joined_at=time.time(),
        )
        queue_key = self._queue_key(time_control, mode)

        # Store full entry data
        await self._redis.setex(
            self._entry_key(ws_key),
            300,  # TTL: 5 minutes max wait
            json.dumps(entry.__dict__),
        )
        # Add to sorted set with ELO as score
        await self._redis.zadd(queue_key, {ws_key: elo})

        position = await self._redis.zrank(queue_key, ws_key)
        return (position or 0) + 1

    async def dequeue(self, ws_key: str, time_control: str, mode: str):
        """Remove a player from the queue (e.g., they disconnected)."""
        queue_key = self._queue_key(time_control, mode)
        await self._redis.zrem(queue_key, ws_key)
        await self._redis.delete(self._entry_key(ws_key))

    async def _get_entry(self, ws_key: str) -> Optional[QueueEntry]:
        data = await self._redis.get(self._entry_key(ws_key))
        if not data:
            return None
        d = json.loads(data)
        return QueueEntry(**d)

    async def _run_loop(self):
        """Background task: poll all queues and create matches."""
        import time
        queue_patterns = [
            ("1+0", "rated"), ("1+0", "casual"),
            ("2+1", "rated"), ("2+1", "casual"),
            ("3+0", "rated"), ("3+0", "casual"),
            ("3+2", "rated"), ("3+2", "casual"),
            ("5+0", "rated"), ("5+0", "casual"),
            ("5+3", "rated"), ("5+3", "casual"),
            ("10+0", "rated"), ("10+0", "casual"),
            ("10+5", "rated"), ("10+5", "casual"),
            ("15+10", "rated"), ("15+10", "casual"),
        ]
        try:
            while True:
                for tc, mode in queue_patterns:
                    await self._try_match(tc, mode)
                await asyncio.sleep(QUEUE_POLL_INTERVAL)
        except asyncio.CancelledError:
            pass

    async def _try_match(self, time_control: str, mode: str):
        """Try to match two players from the same queue."""
        import time
        queue_key = self._queue_key(time_control, mode)
        count = await self._redis.zcard(queue_key)
        if count < 2:
            return

        # Get all players in queue sorted by ELO
        all_players = await self._redis.zrange(queue_key, 0, -1, withscores=True)
        now = time.time()

        for i, (ws_key_a, elo_a) in enumerate(all_players):
            entry_a = await self._get_entry(ws_key_a)
            if not entry_a:
                await self._redis.zrem(queue_key, ws_key_a)
                continue

            wait_time = now - entry_a.joined_at
            elo_window = min(
                INITIAL_ELO_WINDOW + int(wait_time / WINDOW_EXPAND_EVERY) * WINDOW_EXPAND_STEP,
                MAX_ELO_WINDOW
            )

            # Find best opponent within ELO window
            for ws_key_b, elo_b in all_players[i + 1:]:
                if abs(elo_a - elo_b) <= elo_window:
                    entry_b = await self._get_entry(ws_key_b)
                    if entry_b:
                        # Verify both websockets are still connected before matching
                        ws_a = _ws_registry.get(ws_key_a)
                        ws_b = _ws_registry.get(ws_key_b)
                        
                        if not ws_a or not ws_b:
                            if not ws_a:
                                await self._redis.zrem(queue_key, ws_key_a)
                                await self._redis.delete(self._entry_key(ws_key_a))
                            if not ws_b:
                                await self._redis.zrem(queue_key, ws_key_b)
                                await self._redis.delete(self._entry_key(ws_key_b))
                            # We break instead of continue to force re-evaluation of ws_key_a if ws_b was the only one dead
                            if not ws_a:
                                break
                            else:
                                continue

                        await self._create_match(entry_a, entry_b, time_control, mode)
                        return

    async def _create_match(
        self,
        p1: QueueEntry,
        p2: QueueEntry,
        time_control: str,
        mode: str,
    ):
        """Remove both players from queue and create a GameSession."""
        queue_key = self._queue_key(time_control, mode)

        # Remove from queue atomically
        async with self._redis.pipeline() as pipe:
            pipe.zrem(queue_key, p1.ws_key)
            pipe.zrem(queue_key, p2.ws_key)
            pipe.delete(self._entry_key(p1.ws_key))
            pipe.delete(self._entry_key(p2.ws_key))
            await pipe.execute()

        # Randomly assign colors
        import random
        if random.random() < 0.5:
            white_entry, black_entry = p1, p2
        else:
            white_entry, black_entry = p2, p1

        game_id = str(uuid.uuid4())

        # Retrieve WebSocket objects from manager (by ws_key stored in connection)
        white_ws = _ws_registry.get(white_entry.ws_key)
        black_ws = _ws_registry.get(black_entry.ws_key)

        white_player = PlayerInfo(
            user_id=uuid.UUID(white_entry.user_id) if white_entry.user_id else None,
            display_name=white_entry.display_name,
            elo=white_entry.elo,
            ws=None,
        )
        black_player = PlayerInfo(
            user_id=uuid.UUID(black_entry.user_id) if black_entry.user_id else None,
            display_name=black_entry.display_name,
            elo=black_entry.elo,
            ws=None,
        )

        session = GameSession(
            game_id=game_id,
            white=white_player,
            black=black_player,
            time_control=time_control,
            is_rated=(mode == "rated"),
        )
        active_sessions[game_id] = session

        # Send game_ready with each seat's token so clients open /ws/{game_id}.
        # The game itself starts only once both players connect to the game socket
        # (in the WS router) — never here, where ws still points at lobby sockets.
        if white_ws:
            await manager.send_json(
                white_ws, proto.msg_game_ready(game_id, "white", white_player.seat_token))
        if black_ws:
            await manager.send_json(
                black_ws, proto.msg_game_ready(game_id, "black", black_player.seat_token))

        logger.info(f"Match created: {game_id} ({white_entry.display_name} vs {black_entry.display_name})")


# ─── WS Registry ──────────────────────────────────────────────────────────────
# Maps ws_key (str) → WebSocket object
# Populated by the matchmaking lobby WebSocket endpoint

_ws_registry: dict[str, object] = {}


def register_ws(ws_key: str, ws) -> None:
    _ws_registry[ws_key] = ws


def unregister_ws(ws_key: str) -> None:
    _ws_registry.pop(ws_key, None)


# ─── Global Singleton ─────────────────────────────────────────────────────────

matchmaking = MatchmakingService()
