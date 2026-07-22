"""
ConnectionManager: manages WebSocket connections grouped by game room.

Features:
  - Room-based broadcast (only players in same game get messages).
  - Safe disconnect handling.
  - JSON send helpers.
"""
import json
import logging
from collections import defaultdict
from fastapi import WebSocket

logger = logging.getLogger(__name__)


class ConnectionManager:
    def __init__(self):
        # game_id -> set of WebSocket connections
        self._rooms: dict[str, set[WebSocket]] = defaultdict(set)
        # WebSocket -> game_id mapping (for fast reverse lookup)
        self._ws_to_room: dict[WebSocket, str] = {}

    def get_room_size(self, game_id: str) -> int:
        return len(self._rooms.get(game_id, set()))

    def get_room_for_ws(self, ws: WebSocket) -> str | None:
        return self._ws_to_room.get(ws)

    async def connect(self, ws: WebSocket, game_id: str):
        await ws.accept()
        self._rooms[game_id].add(ws)
        self._ws_to_room[ws] = game_id
        logger.info(f"WS connected to room {game_id} (size={self.get_room_size(game_id)})")

    def disconnect(self, ws: WebSocket):
        game_id = self._ws_to_room.pop(ws, None)
        if game_id and game_id in self._rooms:
            self._rooms[game_id].discard(ws)
            if not self._rooms[game_id]:
                del self._rooms[game_id]
            logger.info(f"WS disconnected from room {game_id} (size={self.get_room_size(game_id)})")

    async def send_json(self, ws: WebSocket, data: dict):
        """Send a message to a specific WebSocket, safely."""
        try:
            await ws.send_text(json.dumps(data))
        except Exception as e:
            logger.warning(f"Failed to send to WS: {e}")

    async def broadcast_to_room(self, game_id: str, data: dict, exclude: WebSocket | None = None):
        """Send a message to all connections in a room (except excluded)."""
        room = self._rooms.get(game_id, set()).copy()
        for ws in room:
            if ws is exclude:
                continue
            await self.send_json(ws, data)

    async def send_to_all_in_room(self, game_id: str, data: dict):
        """Send a message to ALL connections in a room."""
        await self.broadcast_to_room(game_id, data, exclude=None)


# Global singleton — imported by routers and game service
manager = ConnectionManager()
