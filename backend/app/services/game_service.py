"""
GameSession: authoritative server-side game state with:
  - python-chess board (single source of truth).
  - Server-side clock (asyncio-based, validated on every move).
  - Reconnection grace period (30s before forfeit on disconnect).
  - Draw offer state machine.
  - PGN generation at game end.
"""
import asyncio
import uuid
import chess
import chess.pgn
import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone
from io import StringIO
from typing import Optional

from app.ws.manager import manager
from app.ws import protocol as proto

logger = logging.getLogger(__name__)

# Reconnection grace period in seconds
RECONNECT_GRACE_SECONDS = 45

# Time controls: "3+0" -> (initial_seconds, increment_seconds)
TIME_CONTROLS: dict[str, tuple[int, int]] = {
    "1+0":   (60, 0),
    "2+1":   (120, 1),
    "3+0":   (180, 0),
    "3+2":   (180, 2),
    "5+0":   (300, 0),
    "5+3":   (300, 3),
    "10+0":  (600, 0),
    "10+5":  (600, 5),
    "15+10": (900, 10),
}


@dataclass
class PlayerInfo:
    user_id: Optional[uuid.UUID]  # None for guests
    display_name: str
    elo: int
    ws: object  # WebSocket connection (or None if disconnected)
    is_bot: bool = False
    bot_level: int = 10  # Stockfish skill level 0-20
    is_connected: bool = True


@dataclass
class GameSession:
    game_id: str
    white: PlayerInfo
    black: PlayerInfo
    time_control: str  # e.g. "10+0"
    is_rated: bool = False

    # Internal state — not in __init__ args to keep dataclass clean
    board: chess.Board = field(default_factory=chess.Board)
    pgn_game: chess.pgn.Game = field(default_factory=chess.pgn.Game)
    pgn_node: chess.pgn.GameNode = field(init=False)

    white_time: float = field(init=False)
    black_time: float = field(init=False)
    increment: int = field(init=False)

    _clock_task: Optional[asyncio.Task] = field(default=None, init=False, repr=False)
    _last_move_time: float = field(default=0.0, init=False)
    _reconnect_tasks: dict = field(default_factory=dict, init=False)

    # Draw offer state: "white" | "black" | None
    _draw_offer_from: Optional[str] = field(default=None, init=False)

    is_over: bool = field(default=False, init=False)

    def __post_init__(self):
        initial, self.increment = TIME_CONTROLS.get(self.time_control, (600, 0))
        self.white_time = float(initial)
        self.black_time = float(initial)
        self.pgn_node = self.pgn_game  # Start at root

        # Set PGN headers
        self.pgn_game.headers["White"] = self.white.display_name
        self.pgn_game.headers["Black"] = self.black.display_name
        self.pgn_game.headers["Date"] = datetime.now(timezone.utc).strftime("%Y.%m.%d")
        self.pgn_game.headers["TimeControl"] = self.time_control

    # ─── Properties ───────────────────────────────────────────────────────────

    @property
    def current_color(self) -> str:
        return "white" if self.board.turn == chess.WHITE else "black"

    @property
    def current_player(self) -> PlayerInfo:
        return self.white if self.board.turn == chess.WHITE else self.black

    def get_ws_color(self, ws) -> Optional[str]:
        if self.white.ws is ws:
            return "white"
        if self.black.ws is ws:
            return "black"
        return None

    def opponent_of(self, color: str) -> PlayerInfo:
        return self.black if color == "white" else self.white

    # ─── Clock ────────────────────────────────────────────────────────────────

    def _start_clock(self):
        """Start the countdown clock for the current player."""
        if self._clock_task:
            self._clock_task.cancel()
        self._last_move_time = asyncio.get_event_loop().time()
        self._clock_task = asyncio.create_task(self._clock_tick())

    async def _clock_tick(self):
        """
        Countdown clock that runs server-side.
        Sends TIME_UPDATE every second and triggers timeout if time runs out.
        """
        try:
            while not self.is_over:
                await asyncio.sleep(0.5)
                now = asyncio.get_event_loop().time()
                elapsed = now - self._last_move_time

                if self.board.turn == chess.WHITE:
                    self.white_time = max(0.0, self.white_time - 0.5)
                    if self.white_time <= 0:
                        await self._handle_timeout("white")
                        return
                else:
                    self.black_time = max(0.0, self.black_time - 0.5)
                    if self.black_time <= 0:
                        await self._handle_timeout("black")
                        return

                # Broadcast time update every second (every 2 ticks)
                if int(elapsed * 2) % 2 == 0:
                    await manager.send_to_all_in_room(
                        self.game_id,
                        proto.msg_time_update(self.white_time, self.black_time)
                    )
        except asyncio.CancelledError:
            pass

    def _stop_clock(self):
        if self._clock_task:
            self._clock_task.cancel()
            self._clock_task = None

    def _consume_time_and_apply_increment(self):
        """Subtract elapsed time from current player, then add increment."""
        now = asyncio.get_event_loop().time()
        elapsed = now - self._last_move_time

        if self.board.turn == chess.WHITE:
            # Board.turn is the player who JUST moved was the opposite
            # After push(), turn has flipped — so we update the player who moved
            pass  # See apply_move() for correct handling

    # ─── Move Handling ────────────────────────────────────────────────────────

    async def apply_move(self, uci: str, ws, override_color: str = None) -> bool:
        """
        Validate and apply a move from the WebSocket connection.
        Returns True if the move was legal and applied.
        """
        logger.info(f"Applying move {uci} override={override_color}")
        if self.is_over:
            logger.info("Game is over")
            return False

        color = override_color or self.get_ws_color(ws)
        logger.info(f"Resolved color: {color}")
        if color is None:
            return False

        # Ensure it's this player's turn
        expected_turn = "white" if self.board.turn == chess.WHITE else "black"
        logger.info(f"Expected turn: {expected_turn}, Got color: {color}")
        if color != expected_turn:
            await manager.send_json(ws, proto.msg_error("Not your turn"))
            return False

        # Validate and execute move
        try:
            move = chess.Move.from_uci(uci)
        except ValueError:
            await manager.send_json(ws, proto.msg_error(f"Invalid UCI: {uci}"))
            return False

        if move not in self.board.legal_moves:
            logger.info(f"Illegal move {uci}")
            await manager.send_json(ws, proto.msg_error("Illegal move"))
            return False

        # Apply the move
        self.board.push(move)
        logger.info(f"Move applied successfully: {uci}")
        # Consume elapsed time from the player who just moved
        now = asyncio.get_event_loop().time()
        elapsed = now - self._last_move_time
        if color == "white":
            self.white_time = max(0.0, self.white_time - elapsed) + self.increment
        else:
            self.black_time = max(0.0, self.black_time - elapsed) + self.increment

        self.pgn_node = self.pgn_node.add_main_variation(move)

        # Cancel draw offer on move
        self._draw_offer_from = None

        # Broadcast updated game state to both players
        is_check = self.board.is_check()
        next_turn = "white" if self.board.turn == chess.WHITE else "black"

        await manager.send_to_all_in_room(
            self.game_id,
            proto.msg_game_update(
                fen=self.board.fen(),
                last_move_uci=uci,
                white_time=self.white_time,
                black_time=self.black_time,
                turn=next_turn,
                check=is_check,
            )
        )

        # Check for game over conditions
        if self.board.is_checkmate():
            winner = "white" if self.board.turn == chess.BLACK else "black"
            await self._finish_game(winner, "checkmate")
            return True
        if self.board.is_stalemate():
            await self._finish_game("draw", "stalemate")
            return True
        if self.board.is_insufficient_material():
            await self._finish_game("draw", "insufficient_material")
            return True
        if self.board.is_seventyfive_moves():
            await self._finish_game("draw", "75_move_rule")
            return True
        if self.board.is_fivefold_repetition():
            await self._finish_game("draw", "fivefold_repetition")
            return True

        # Restart clock for next player
        self._start_clock()

        return True

    # ─── Game Termination ─────────────────────────────────────────────────────

    async def _handle_timeout(self, loser_color: str):
        winner = "black" if loser_color == "white" else "white"
        # Edge case: if winner has insufficient material, it's a draw
        if self.board.is_insufficient_material():
            await self._finish_game("draw", "timeout_insufficient")
        else:
            await self._finish_game(winner, "timeout")

    async def handle_resign(self, ws) -> bool:
        color = self.get_ws_color(ws)
        if not color:
            return False
        winner = "black" if color == "white" else "white"
        await self._finish_game(winner, "resignation")
        return True

    async def handle_draw_offer(self, ws):
        color = self.get_ws_color(ws)
        if not color or self.is_over:
            return
        self._draw_offer_from = color
        opponent_ws = self.opponent_of(color).ws
        if opponent_ws:
            await manager.send_json(opponent_ws, proto.msg_draw_offered())

    async def handle_draw_response(self, ws, accepted: bool):
        color = self.get_ws_color(ws)
        if not color or not self._draw_offer_from:
            return
        # Only the player who received the offer can accept/decline
        if self._draw_offer_from == color:
            return
        if accepted:
            await self._finish_game("draw", "agreement")
        else:
            self._draw_offer_from = None
            offerer_ws = self.opponent_of(color).ws
            if offerer_ws:
                await manager.send_json(offerer_ws, proto.msg_draw_declined())

    async def _finish_game(self, result: str, reason: str,
                           white_elo_delta: int = 0, black_elo_delta: int = 0):
        """Finalize the game: stop clock, broadcast result, set PGN outcome."""
        if self.is_over:
            return
        self.is_over = True
        self._stop_clock()

        # Set PGN result header
        if result == "white":
            self.pgn_game.headers["Result"] = "1-0"
        elif result == "black":
            self.pgn_game.headers["Result"] = "0-1"
        else:
            self.pgn_game.headers["Result"] = "1/2-1/2"

        pgn_str = self._export_pgn()

        await manager.send_to_all_in_room(
            self.game_id,
            proto.msg_game_over(
                result=result,
                reason=reason,
                white_time=self.white_time,
                black_time=self.black_time,
                pgn=pgn_str,
                white_elo_delta=white_elo_delta,
                black_elo_delta=black_elo_delta,
            )
        )
        logger.info(f"Game {self.game_id} over: {result} by {reason}")

    def _export_pgn(self) -> str:
        buf = StringIO()
        exporter = chess.pgn.FileExporter(buf)
        self.pgn_game.accept(exporter)
        return buf.getvalue()

    # ─── Reconnection ─────────────────────────────────────────────────────────

    async def handle_disconnect(self, ws):
        """Called when a player's WebSocket closes unexpectedly."""
        color = self.get_ws_color(ws)
        if not color or self.is_over:
            return

        player = self.white if color == "white" else self.black
        player.is_connected = False
        player.ws = None

        # Notify opponent
        opponent = self.opponent_of(color)
        if opponent.ws:
            await manager.send_json(
                opponent.ws,
                proto.msg_opponent_disconnected(RECONNECT_GRACE_SECONDS)
            )

        # Start grace period countdown
        task = asyncio.create_task(self._reconnect_timeout(color))
        self._reconnect_tasks[color] = task

    async def _reconnect_timeout(self, color: str):
        """If player doesn't reconnect within grace period, they forfeit."""
        try:
            await asyncio.sleep(RECONNECT_GRACE_SECONDS)
            # Still disconnected → forfeit
            winner = "black" if color == "white" else "white"
            await self._finish_game(winner, "abandonment")
        except asyncio.CancelledError:
            pass  # Player reconnected — task was cancelled

    async def handle_reconnect(self, ws, color: str):
        """Called when a player reconnects to an ongoing game."""
        player = self.white if color == "white" else self.black
        player.ws = ws
        player.is_connected = True

        # Cancel grace period
        task = self._reconnect_tasks.pop(color, None)
        if task:
            task.cancel()

        # Send current game state to reconnected player
        await manager.send_json(ws, proto.msg_game_update(
            fen=self.board.fen(),
            last_move_uci=self.board.peek().uci() if self.board.move_stack else "",
            white_time=self.white_time,
            black_time=self.black_time,
            turn="white" if self.board.turn == chess.WHITE else "black",
            check=self.board.is_check(),
        ))

        # Notify opponent
        opponent = self.opponent_of(color)
        if opponent.ws:
            await manager.send_json(opponent.ws, proto.msg_opponent_reconnected())

    # ─── Start ────────────────────────────────────────────────────────────────

    async def start(self):
        """Send game_start to both players and begin the clock."""
        start_msg_white = proto.msg_game_start(
            color="white",
            opponent_name=self.black.display_name,
            opponent_elo=self.black.elo,
            fen=self.board.fen(),
            time_control=self.time_control,
            white_time=self.white_time,
            black_time=self.black_time,
            game_id=self.game_id,
        )
        start_msg_black = proto.msg_game_start(
            color="black",
            opponent_name=self.white.display_name,
            opponent_elo=self.white.elo,
            fen=self.board.fen(),
            time_control=self.time_control,
            white_time=self.white_time,
            black_time=self.black_time,
            game_id=self.game_id,
        )

        if self.white.ws:
            await manager.send_json(self.white.ws, start_msg_white)
        if self.black.ws and not self.black.is_bot:
            await manager.send_json(self.black.ws, start_msg_black)

        self._last_move_time = asyncio.get_event_loop().time()
        self._start_clock()

        # If black is a bot, trigger its first move if it ever gets turn (white moves first anyway)
        logger.info(f"Game {self.game_id} started: {self.white.display_name} vs {self.black.display_name}")


# ─── Active Sessions Registry ─────────────────────────────────────────────────

# game_id -> GameSession
active_sessions: dict[str, GameSession] = {}
