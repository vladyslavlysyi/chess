"""
WebSocket Protocol: all message types that flow between server and client.

Client → Server messages: "move", "resign", "offer_draw", "accept_draw", "reconnect"
Server → Client messages: "game_start", "game_update", "game_over", "error",
                          "time_update", "opponent_disconnected", "opponent_reconnected",
                          "draw_offered", "draw_declined"
"""
from enum import Enum


class ClientMsgType(str, Enum):
    MOVE = "move"
    RESIGN = "resign"
    OFFER_DRAW = "offer_draw"
    ACCEPT_DRAW = "accept_draw"
    DECLINE_DRAW = "decline_draw"
    RECONNECT = "reconnect"
    PING = "ping"


class ServerMsgType(str, Enum):
    GAME_START = "game_start"
    GAME_UPDATE = "game_update"
    GAME_OVER = "game_over"
    TIME_UPDATE = "time_update"
    DRAW_OFFERED = "draw_offered"
    DRAW_DECLINED = "draw_declined"
    OPPONENT_DISCONNECTED = "opponent_disconnected"
    OPPONENT_RECONNECTED = "opponent_reconnected"
    ERROR = "error"
    PONG = "pong"
    QUEUED = "queued"
    GAME_READY = "game_ready"
    CANCELLED = "cancelled"


# ─── Message Builders ─────────────────────────────────────────────────────────

def msg_game_start(color: str, opponent_name: str, opponent_elo: int,
                   fen: str, time_control: str, white_time: float, black_time: float,
                   game_id: str) -> dict:
    return {
        "type": ServerMsgType.GAME_START,
        "color": color,           # "white" | "black"
        "opponent": opponent_name,
        "opponent_elo": opponent_elo,
        "fen": fen,
        "time_control": time_control,
        "white_time": white_time,
        "black_time": black_time,
        "game_id": game_id,
    }


def msg_game_update(fen: str, last_move_uci: str, white_time: float,
                    black_time: float, turn: str, check: bool) -> dict:
    return {
        "type": ServerMsgType.GAME_UPDATE,
        "fen": fen,
        "last_move_uci": last_move_uci,
        "white_time": white_time,
        "black_time": black_time,
        "turn": turn,   # "white" | "black"
        "check": check,
    }


def msg_game_over(result: str, reason: str, white_time: float, black_time: float,
                  pgn: str, white_elo_delta: int = 0, black_elo_delta: int = 0) -> dict:
    return {
        "type": ServerMsgType.GAME_OVER,
        "result": result,   # "white" | "black" | "draw"
        "reason": reason,   # "checkmate" | "timeout" | "resignation" | "stalemate" | "insufficient" | "agreement"
        "white_time": white_time,
        "black_time": black_time,
        "pgn": pgn,
        "white_elo_delta": white_elo_delta,
        "black_elo_delta": black_elo_delta,
    }


def msg_time_update(white_time: float, black_time: float) -> dict:
    return {
        "type": ServerMsgType.TIME_UPDATE,
        "white_time": white_time,
        "black_time": black_time,
    }


def msg_error(detail: str) -> dict:
    return {"type": ServerMsgType.ERROR, "detail": detail}


def msg_opponent_disconnected(grace_seconds: int) -> dict:
    return {
        "type": ServerMsgType.OPPONENT_DISCONNECTED,
        "grace_seconds": grace_seconds,
    }


def msg_opponent_reconnected() -> dict:
    return {"type": ServerMsgType.OPPONENT_RECONNECTED}


def msg_draw_offered() -> dict:
    return {"type": ServerMsgType.DRAW_OFFERED}


def msg_draw_declined() -> dict:
    return {"type": ServerMsgType.DRAW_DECLINED}


def msg_queued(position: int) -> dict:
    return {"type": ServerMsgType.QUEUED, "position": position}


def msg_game_ready(game_id: str, color: str, seat_token: str) -> dict:
    """Tell a client to open /ws/{game_id} using seat_token to claim its seat."""
    return {
        "type": ServerMsgType.GAME_READY,
        "game_id": game_id,
        "color": color,
        "seat_token": seat_token,
    }


def msg_cancelled() -> dict:
    return {"type": ServerMsgType.CANCELLED}
