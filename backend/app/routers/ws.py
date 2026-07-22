"""
WebSocket router: /ws/{game_id}

Handles the real-time game loop:
  1. Player connects with an optional JWT token and a per-seat ``seat_token``.
  2. Server maps the connection to a seat (by seat_token, then authed user_id).
  3. Messages are dispatched to GameSession methods.

Seat resolution never relies on the display name, so guests and authenticated
users can (re)connect and reconnect reliably.
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
from app.ws.protocol import ClientMsgType, msg_error, msg_game_update

router = APIRouter(tags=["websocket"])
logger = logging.getLogger(__name__)


async def _resolve_user_id(token: Optional[str], db: AsyncSession) -> Optional[uuid.UUID]:
    """Resolve a JWT token to an active user's id, or None for guests/invalid."""
    if not token:
        return None
    payload = decode_access_token(token)
    if not payload:
        return None
    sub = payload.get("sub")
    if not sub:
        return None
    try:
        user_uuid = uuid.UUID(sub)
    except (ValueError, TypeError, AttributeError):
        return None
    user = await get_user_by_id(db, user_uuid)
    if not user or not user.is_active:
        return None
    return user.id


@router.websocket("/ws/{game_id}")
async def websocket_game(
    ws: WebSocket,
    game_id: str,
    token: Optional[str] = Query(default=None),
    seat_token: Optional[str] = Query(default=None),
    db: AsyncSession = Depends(get_db),
):
    """Main game WebSocket endpoint: /ws/{game_id}?seat_token=<...>&token=<jwt>"""
    user_id = await _resolve_user_id(token, db)

    session = active_sessions.get(game_id)
    if not session:
        await ws.accept()
        await ws.send_text(json.dumps(msg_error("Game not found")))
        await ws.close(code=4004)
        return

    # Map this connection to a seat (by seat_token first, then authed user_id).
    color = session.seat_for(seat_token, user_id)
    if color is None:
        await ws.accept()
        await ws.send_text(json.dumps(msg_error("You are not a player in this game")))
        await ws.close(code=4003)
        return

    seat = session.white if color == "white" else session.black
    seat.ws = ws
    seat.is_connected = True

    await manager.connect(ws, game_id)

    # Decide start vs reconnect vs finished-view.
    if session.is_over:
        # Late viewer of a finished game — send the final board snapshot.
        white_t, black_t = session._snapshot()
        await manager.send_json(ws, msg_game_update(
            fen=session.board.fen(),
            last_move_uci=session.board.peek().uci() if session.board.move_stack else "",
            white_time=white_t, black_time=black_t,
            turn=session.current_color, check=session.board.is_check(),
        ))
    elif session.started:
        await session.handle_reconnect(ws, color)
    else:
        # Game not started yet — start once both seats are present.
        white_ready = session.white.ws is not None
        black_ready = session.black.is_bot or (session.black.ws is not None)
        if white_ready and black_ready:
            await session.start()
            # If it is the bot's move first (shouldn't happen — white moves first),
            # trigger it defensively.
            if not session.is_over and session.current_player.is_bot:
                await _trigger_bot_move(session)

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
                applied = await session.apply_move(uci, ws)
                # Trigger the bot's reply if it's now the bot's turn.
                if applied and not session.is_over and session.current_player.is_bot:
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
        pass
    except Exception as e:
        logger.exception(f"Unexpected error in WS handler for game {game_id}: {e}")
    finally:
        # Always release the socket and, if this connection still owns its seat,
        # kick off the reconnect grace / forfeit flow.
        manager.disconnect(ws)
        if seat.ws is ws:
            await session.handle_disconnect(ws)


async def _trigger_bot_move(session):
    """Ask the bot service for the next move and apply it."""
    import asyncio
    from app.services.bot_service import get_bot_move

    # Small delay so the bot feels more natural.
    await asyncio.sleep(0.3)
    if session.is_over:
        return

    move_uci = await asyncio.to_thread(
        get_bot_move,
        board=session.board.copy(),
        skill_level=session.black.bot_level,
    )
    if move_uci and not session.is_over:
        await session.apply_move(move_uci, None, override_color="black")
