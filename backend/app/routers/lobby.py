"""
Matchmaking & Bot WebSocket lobby endpoints.

/ws/lobby  — player connects here to find a match or start a bot game.
             They wait here until matched, then get a game_id and move to /ws/{game_id}.
"""
import json
import logging
import uuid
from typing import Optional

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.services.auth_service import decode_access_token, get_user_by_id
from app.services.matchmaking import matchmaking, register_ws, unregister_ws
from app.services.game_service import GameSession, PlayerInfo, active_sessions
from app.ws import protocol as proto
from app.services.bot_service import skill_level_from_elo

router = APIRouter(tags=["lobby"])
logger = logging.getLogger(__name__)


from dataclasses import dataclass
import random
import string
import time

@dataclass
class PrivateRoom:
    host_ws_key: str
    user_id: Optional[uuid.UUID]
    display_name: str
    elo: int
    time_control: str
    created_at: float

private_rooms: dict[str, PrivateRoom] = {}


@router.websocket("/ws/lobby")
async def websocket_lobby(
    ws: WebSocket,
    token: Optional[str] = Query(default=None),
    db: AsyncSession = Depends(get_db),
):
    """
    Lobby WebSocket for matchmaking and bot game creation.
    
    Client sends one of:
      {"type": "find_match", "time_control": "10+0", "mode": "rated"}
      {"type": "find_match", "time_control": "5+0", "mode": "casual"}
      {"type": "play_bot", "time_control": "10+0", "skill_level": 10}
      {"type": "create_private", "time_control": "10+0"}
      {"type": "join_private", "room_code": "..."}
      {"type": "cancel"}
    
    Server responds with:
      {"type": "queued", "position": 3}
      {"type": "private_room_created", "room_code": "..."}
      {"type": "game_ready", "game_id": "...", "color": "white|black"}
    """
    await ws.accept()

    # Resolve player identity from token (active users only; else guest).
    user_id, display_name, elo = None, f"Guest_{uuid.uuid4().hex[:6]}", 1200
    if token:
        payload = decode_access_token(token)
        if payload:
            user_id_str = payload.get("sub")
            if user_id_str:
                try:
                    user_uuid = uuid.UUID(user_id_str)
                except (ValueError, TypeError):
                    user_uuid = None
                user = await get_user_by_id(db, user_uuid) if user_uuid else None
                if user and user.is_active:
                    user_id = user.id
                    display_name = user.username
                    elo = user.elo_rapid

    ws_key = uuid.uuid4().hex
    register_ws(ws_key, ws)
    queued_tc = None
    queued_mode = None
    created_room_code = None

    try:
        while True:
            raw = await ws.receive_text()
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                await ws.send_text(json.dumps(proto.msg_error("Invalid JSON")))
                continue

            msg_type = msg.get("type")

            if msg_type == "find_match":
                time_control = msg.get("time_control", "10+0")
                mode = msg.get("mode", "casual")
                queued_tc = time_control
                queued_mode = mode

                position = await matchmaking.enqueue(
                    user_id=user_id,
                    display_name=display_name,
                    elo=elo,
                    time_control=time_control,
                    mode=mode,
                    ws_key=ws_key,
                )
                await ws.send_text(json.dumps(proto.msg_queued(position)))

            elif msg_type == "play_bot":
                time_control = msg.get("time_control", "10+0")
                target_elo = msg.get("target_elo", 1500)
                skill_level = skill_level_from_elo(target_elo)

                game_id = str(uuid.uuid4())
                white = PlayerInfo(
                    user_id=user_id,
                    display_name=display_name,
                    elo=elo,
                    ws=ws,
                )
                bot = PlayerInfo(
                    user_id=None,
                    display_name=f"Stockfish (ELO ~{target_elo})",
                    elo=target_elo,
                    ws=None,
                    is_bot=True,
                    bot_level=skill_level,
                )
                session = GameSession(
                    game_id=game_id,
                    white=white,
                    black=bot,
                    time_control=time_control,
                    is_rated=False,
                )
                active_sessions[game_id] = session

                # Hand the client its seat token; the game starts when it opens
                # /ws/{game_id} (the bot seat needs no socket).
                await ws.send_text(json.dumps(
                    proto.msg_game_ready(game_id, "white", white.seat_token)))
                break  # Lobby WS done — game WS (/ws/{game_id}) takes over
                
            elif msg_type == "create_private":
                time_control = msg.get("time_control", "10+0")
                room_code = "".join(random.choices(string.ascii_uppercase + string.digits, k=6))
                created_room_code = room_code
                private_rooms[room_code] = PrivateRoom(
                    host_ws_key=ws_key,
                    user_id=user_id,
                    display_name=display_name,
                    elo=elo,
                    time_control=time_control,
                    created_at=time.time()
                )
                await ws.send_text(json.dumps({
                    "type": "private_room_created",
                    "room_code": room_code
                }))
                
            elif msg_type == "join_private":
                room_code = msg.get("room_code", "").upper()
                room = private_rooms.pop(room_code, None)
                if not room:
                    await ws.send_text(json.dumps(proto.msg_error("Invalid or expired room code.")))
                    continue
                
                from app.services.matchmaking import _ws_registry
                host_ws = _ws_registry.get(room.host_ws_key)
                if not host_ws:
                    await ws.send_text(json.dumps(proto.msg_error("Host has left the room.")))
                    continue

                game_id = str(uuid.uuid4())
                
                # Randomize colors
                host_is_white = random.choice([True, False])
                
                host_player = PlayerInfo(
                    user_id=room.user_id,
                    display_name=room.display_name,
                    elo=room.elo,
                    ws=host_ws
                )
                joiner_player = PlayerInfo(
                    user_id=user_id,
                    display_name=display_name,
                    elo=elo,
                    ws=ws
                )
                
                white = host_player if host_is_white else joiner_player
                black = joiner_player if host_is_white else host_player
                
                session = GameSession(
                    game_id=game_id,
                    white=white,
                    black=black,
                    time_control=room.time_control,
                    is_rated=False,
                )
                active_sessions[game_id] = session
                
                # Send game_ready to both
                await host_ws.send_text(json.dumps(
                    proto.msg_game_ready(game_id, "white" if host_is_white else "black", host_player.seat_token)
                ))
                await ws.send_text(json.dumps(
                    proto.msg_game_ready(game_id, "black" if host_is_white else "white", joiner_player.seat_token)
                ))
                break # leave lobby

            elif msg_type == "cancel":
                if queued_tc and queued_mode:
                    await matchmaking.dequeue(ws_key, queued_tc, queued_mode)
                    queued_tc = None
                    queued_mode = None
                    await ws.send_text(json.dumps(proto.msg_cancelled()))
                elif created_room_code:
                    private_rooms.pop(created_room_code, None)
                    created_room_code = None
                    await ws.send_text(json.dumps(proto.msg_cancelled()))

            elif msg_type == "ping":
                await ws.send_text(json.dumps({"type": "pong"}))

    except WebSocketDisconnect:
        if queued_tc and queued_mode:
            await matchmaking.dequeue(ws_key, queued_tc, queued_mode)
        if created_room_code:
            private_rooms.pop(created_room_code, None)
    finally:
        unregister_ws(ws_key)
