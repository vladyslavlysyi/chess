"""
WebSocket router: /ws/{game_id}

Handles the real-time game loop:
  1. Player connects with JWT token as query param.
  2. Server validates token and links WS to the correct GameSession.
  3. Messages are dispatched to GameSession methods.
"""
import json
import logging
import uuid
from typing import Optional

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.services.auth_service import decode_access_token, get_user_by_id
from app.services.game_service import active_sessions
from app.ws.manager import manager
from app.ws.protocol import ClientMsgType, msg_error

router = APIRouter(tags=["websocket"])
logger = logging.getLogger(__name__)


async def _resolve_player(token: Optional[str], db: AsyncSession):
    """Resolve a JWT token to a (user_id, username, elo) tuple. Returns None for guests."""
    if not token:
        return None, f"Guest_{uuid.uuid4().hex[:6]}", 1200

    payload = decode_access_token(token)
    if not payload:
        return None, f"Guest_{uuid.uuid4().hex[:6]}", 1200

    user = await get_user_by_id(db, uuid.UUID(payload["sub"]))
    if not user:
        return None, f"Guest_{uuid.uuid4().hex[:6]}", 1200

    return user.id, user.username, user.elo_rapid


@router.websocket("/ws/{game_id}")
async def websocket_game(
    ws: WebSocket,
    game_id: str,
    token: Optional[str] = Query(default=None),
    db: AsyncSession = Depends(get_db),
):
    """
    Main game WebSocket endpoint.
    Client connects to /ws/{game_id}?token=<jwt>
    """
    # Resolve player identity
    user_id, username, elo = await _resolve_player(token, db)

    # Look up the session
    session = active_sessions.get(game_id)
    if not session:
        # Reject with close code 4004 (Not Found)
        await ws.accept()
        await ws.send_text(json.dumps(msg_error("Game not found")))
        await ws.close(code=4004)
        return

    # Determine which color this connection belongs to
    color = None
    if session.white.display_name == username:
        color = "white"
        session.white.ws = ws
    elif session.black.display_name == username:
        color = "black"
        session.black.ws = ws
    else:
        # Spectator or reconnect with mismatched name
        await ws.accept()
        await ws.send_text(json.dumps(msg_error("You are not a player in this game")))
        await ws.close(code=4003)
        return

    await manager.connect(ws, game_id)

    # Handle reconnection to an in-progress game
    if not session.is_over and session.board.move_stack:
        await session.handle_reconnect(ws, color)
    elif not session.is_over and not session.board.move_stack:
        # Game hasn't started — check if both players are now connected
        white_ready = session.white.ws is not None
        black_ready = session.black.is_bot or (session.black.ws is not None)
        if white_ready and black_ready:
            await session.start()

    try:
        while True:
            raw = await ws.receive_text()
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                await manager.send_json(ws, msg_error("Invalid JSON"))
                continue

            msg_type = msg.get("type")

            if msg_type == ClientMsgType.PING:
                await manager.send_json(ws, {"type": "pong"})

            elif msg_type == ClientMsgType.MOVE:
                uci = msg.get("uci", "")
                await session.apply_move(uci, ws)

                # Trigger bot move if it's the bot's turn
                if not session.is_over and session.current_player.is_bot:
                    await _trigger_bot_move(session)

            elif msg_type == ClientMsgType.RESIGN:
                await session.handle_resign(ws)

            elif msg_type == ClientMsgType.OFFER_DRAW:
                await session.handle_draw_offer(ws)

            elif msg_type == ClientMsgType.ACCEPT_DRAW:
                await session.handle_draw_response(ws, accepted=True)

            elif msg_type == ClientMsgType.DECLINE_DRAW:
                await session.handle_draw_response(ws, accepted=False)

            else:
                await manager.send_json(ws, msg_error(f"Unknown message type: {msg_type}"))

    except WebSocketDisconnect:
        manager.disconnect(ws)
        await session.handle_disconnect(ws)
    except Exception as e:
        logger.exception(f"Unexpected error in WS handler for game {game_id}: {e}")
        manager.disconnect(ws)


async def _trigger_bot_move(session):
    """Ask the bot service for the next move and apply it."""
    import asyncio
    from app.services.bot_service import get_bot_move

    # Small delay to make bot feel more natural
    await asyncio.sleep(0.3)

    if session.is_over:
        return

    move_uci = await asyncio.to_thread(
        get_bot_move,
        board=session.board.copy(),
        skill_level=session.black.bot_level,
    )
    if move_uci and not session.is_over:
        # Apply bot move using the black player's (bot) perspective
        await session.apply_move(move_uci, session.black.ws or object())
