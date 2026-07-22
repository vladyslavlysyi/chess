"""
GameSession: authoritative server-side game state with:
  - python-chess board (single source of truth).
  - Server-side clock (timestamp-based, validated on every move).
  - Reconnection grace period before forfeit on disconnect.
  - Draw offer state machine.
  - PGN generation + rating/history persistence at game end.

Player identity is keyed on a per-seat ``seat_token`` (works for guests and
authenticated users alike) with an authenticated ``user_id`` fallback — never on
the mutable display name.
"""
import asyncio
import secrets
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

# Reconnection grace period in seconds (keep in sync with the client message).
RECONNECT_GRACE_SECONDS = 45

# How long a finished session lingers in memory so late reconnects / final-state
# fetches still succeed, before it is garbage-collected from ``active_sessions``.
FINISHED_SESSION_TTL_SECONDS = 180

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


def rating_class_for(time_control: str) -> str:
    """Map a time control to a rating class: bullet | blitz | rapid."""
    initial = TIME_CONTROLS.get(time_control, (600, 0))[0]
    if initial < 180:
        return "bullet"
    if initial < 600:
        return "blitz"
    return "rapid"


@dataclass
class PlayerInfo:
    user_id: Optional[uuid.UUID]  # None for guests
    display_name: str
    elo: int
    ws: object  # WebSocket connection (or None if disconnected)
    is_bot: bool = False
    bot_level: int = 10  # Stockfish skill level 0-20
    is_connected: bool = True
    # Per-seat secret used to (re)attach a client to this seat. Bots have none.
    seat_token: str = field(default_factory=lambda: secrets.token_urlsafe(16))


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

    white_time: float = field(init=False)   # banked seconds (mutated only on move)
    black_time: float = field(init=False)
    increment: int = field(init=False)

    _clock_task: Optional[asyncio.Task] = field(default=None, init=False, repr=False)
    _turn_started_at: float = field(default=0.0, init=False)
    _reconnect_tasks: dict = field(default_factory=dict, init=False)
    _cleanup_task: Optional[asyncio.Task] = field(default=None, init=False, repr=False)

    # Draw offer state: "white" | "black" | None
    _draw_offer_from: Optional[str] = field(default=None, init=False)

    started: bool = field(default=False, init=False)
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
        if ws is None:
            return None
        if self.white.ws is ws:
            return "white"
        if self.black.ws is ws:
            return "black"
        return None

    def opponent_of(self, color: str) -> PlayerInfo:
        return self.black if color == "white" else self.white

    def seat_for(self, seat_token: Optional[str], user_id: Optional[uuid.UUID]) -> Optional[str]:
        """Resolve which seat a connection belongs to (by seat token, then user id)."""
        if seat_token:
            if secrets.compare_digest(self.white.seat_token, seat_token):
                return "white"
            if not self.black.is_bot and secrets.compare_digest(self.black.seat_token, seat_token):
                return "black"
        if user_id is not None:
            if self.white.user_id == user_id:
                return "white"
            if self.black.user_id == user_id:
                return "black"
        return None

    # ─── Clock (timestamp-based, no double counting) ────────────────────────────

    @staticmethod
    def _now() -> float:
        return asyncio.get_running_loop().time()

    def _remaining(self, color: str) -> float:
        """Live remaining seconds for a color (banked minus time spent this turn)."""
        banked = self.white_time if color == "white" else self.black_time
        if not self.is_over and self.started and color == self.current_color:
            return max(0.0, banked - (self._now() - self._turn_started_at))
        return banked

    def _snapshot(self) -> tuple[float, float]:
        return self._remaining("white"), self._remaining("black")

    def _start_clock(self):
        """(Re)start the ticking loop for the current player's turn."""
        self._turn_started_at = self._now()
        if self._clock_task:
            self._clock_task.cancel()
        self._clock_task = asyncio.create_task(self._clock_tick())

    async def _clock_tick(self):
        """
        Broadcasts TIME_UPDATE ~once per second and triggers timeout when the
        active player's live remaining time reaches zero. It does NOT mutate the
        banked clocks — that happens only in apply_move — so time is never
        double-counted.
        """
        try:
            while not self.is_over:
                await asyncio.sleep(0.5)
                if self.is_over:
                    return
                mover = self.current_color
                if self._remaining(mover) <= 0:
                    # Bank it at zero and flag.
                    if mover == "white":
                        self.white_time = 0.0
                    else:
                        self.black_time = 0.0
                    await self._handle_timeout(mover)
                    return
                white_t, black_t = self._snapshot()
                await manager.send_to_all_in_room(
                    self.game_id, proto.msg_time_update(white_t, black_t)
                )
        except asyncio.CancelledError:
            pass

    def _stop_clock(self):
        if self._clock_task:
            self._clock_task.cancel()
            self._clock_task = None

    # ─── Move Handling ────────────────────────────────────────────────────────

    async def apply_move(self, uci: str, ws, override_color: str = None) -> bool:
        """
        Validate and apply a move from the WebSocket connection.
        Returns True if the move was legal and applied.
        """
        if self.is_over:
            return False

        color = override_color or self.get_ws_color(ws)
        if color is None:
            return False

        # Ensure it's this player's turn
        expected_turn = self.current_color
        if color != expected_turn:
            await manager.send_json(ws, proto.msg_error("Not your turn"))
            return False

        # Parse & validate the move
        try:
            move = chess.Move.from_uci(uci)
        except ValueError:
            await manager.send_json(ws, proto.msg_error(f"Invalid UCI: {uci}"))
            return False

        if move not in self.board.legal_moves:
            await manager.send_json(ws, proto.msg_error("Illegal move"))
            return False

        # Consume the time the mover actually spent this turn, then add increment.
        elapsed = self._now() - self._turn_started_at
        if color == "white":
            self.white_time = max(0.0, self.white_time - elapsed) + self.increment
        else:
            self.black_time = max(0.0, self.black_time - elapsed) + self.increment

        # Apply the move.
        self.board.push(move)
        self.pgn_node = self.pgn_node.add_main_variation(move)

        # Cancel any pending draw offer on move.
        self._draw_offer_from = None

        white_t, black_t = self.white_time, self.black_time
        is_check = self.board.is_check()
        next_turn = self.current_color

        await manager.send_to_all_in_room(
            self.game_id,
            proto.msg_game_update(
                fen=self.board.fen(),
                last_move_uci=uci,
                white_time=white_t,
                black_time=black_t,
                turn=next_turn,
                check=is_check,
            )
        )

        # Check for game-over conditions.
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

        # Restart clock for the next player.
        self._start_clock()
        return True

    # ─── Game Termination ─────────────────────────────────────────────────────

    async def _handle_timeout(self, loser_color: str):
        winner = "black" if loser_color == "white" else "white"
        winner_bool = chess.WHITE if winner == "white" else chess.BLACK
        # FIDE: a flag-fall is a draw only if the winner cannot possibly mate.
        if self.board.has_insufficient_material(winner_bool):
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
        # Only the player who RECEIVED the offer can accept/decline.
        if self._draw_offer_from == color:
            return
        if accepted:
            await self._finish_game("draw", "agreement")
        else:
            self._draw_offer_from = None
            offerer_ws = self.opponent_of(color).ws
            if offerer_ws:
                await manager.send_json(offerer_ws, proto.msg_draw_declined())

    async def _finish_game(self, result: str, reason: str):
        """Finalize the game: stop clock, persist + rate, broadcast result."""
        if self.is_over:
            return
        self.is_over = True
        self._stop_clock()

        # Cancel any pending reconnect grace timers so they can't fire later.
        for task in self._reconnect_tasks.values():
            task.cancel()
        self._reconnect_tasks.clear()

        # Set PGN result header.
        if result == "white":
            self.pgn_game.headers["Result"] = "1-0"
        elif result == "black":
            self.pgn_game.headers["Result"] = "0-1"
        else:
            self.pgn_game.headers["Result"] = "1/2-1/2"

        pgn_str = self._export_pgn()

        # Persist the game and update ratings (best-effort — must not crash the WS).
        white_delta, black_delta = 0, 0
        try:
            white_delta, black_delta = await self._persist_result(result, pgn_str)
        except Exception:
            logger.exception(f"Failed to persist result for game {self.game_id}")

        white_t, black_t = self.white_time, self.black_time
        await manager.send_to_all_in_room(
            self.game_id,
            proto.msg_game_over(
                result=result,
                reason=reason,
                white_time=white_t,
                black_time=black_t,
                pgn=pgn_str,
                white_elo_delta=white_delta,
                black_elo_delta=black_delta,
            )
        )
        logger.info(f"Game {self.game_id} over: {result} by {reason} "
                    f"(Δw={white_delta}, Δb={black_delta})")

        self._schedule_cleanup()

    def _export_pgn(self) -> str:
        buf = StringIO()
        exporter = chess.pgn.FileExporter(buf)
        self.pgn_game.accept(exporter)
        return buf.getvalue()

    # ─── Persistence & Rating ───────────────────────────────────────────────────

    async def _persist_result(self, result: str, pgn_str: str) -> tuple[int, int]:
        """
        Persist the finished game and, if rated, update Glicko-2 ratings.

        Returns (white_elo_delta, black_elo_delta). Guest-vs-guest games are not
        persisted (no owner). Bot/casual games are persisted for the human's
        history but do not change ratings.
        """
        # Imported lazily to keep module import order simple.
        from app.database import AsyncSessionLocal
        from app.models import User, Game, RatingHistory, GameStatus, TimeControl
        from app.services.elo import GlickoPlayer, single_game_update

        if self.white.user_id is None and self.black.user_id is None:
            return 0, 0  # Guest vs guest / bot vs nobody — nothing to store.

        rclass = rating_class_for(self.time_control)
        elo_field, rd_field, vol_field = f"elo_{rclass}", f"rd_{rclass}", f"vol_{rclass}"

        # Scores from white's perspective.
        if result == "white":
            w_score, b_score = 1.0, 0.0
        elif result == "black":
            w_score, b_score = 0.0, 1.0
        else:
            w_score, b_score = 0.5, 0.5

        white_delta = black_delta = 0

        async with AsyncSessionLocal() as db:
            white_user = await db.get(User, self.white.user_id) if self.white.user_id else None
            black_user = await db.get(User, self.black.user_id) if self.black.user_id else None

            white_before = getattr(white_user, elo_field) if white_user else self.white.elo
            black_before = getattr(black_user, elo_field) if black_user else self.black.elo
            white_after, black_after = white_before, black_before

            both_human = white_user is not None and black_user is not None and not self.black.is_bot
            rated = self.is_rated and both_human

            if rated:
                wp = GlickoPlayer(getattr(white_user, elo_field),
                                  getattr(white_user, rd_field),
                                  getattr(white_user, vol_field))
                bp = GlickoPlayer(getattr(black_user, elo_field),
                                  getattr(black_user, rd_field),
                                  getattr(black_user, vol_field))
                # Both computed from PRE-game state before mutating either row.
                new_wp, white_delta = single_game_update(wp, bp, w_score)
                new_bp, black_delta = single_game_update(bp, wp, b_score)

                setattr(white_user, elo_field, int(new_wp.rating))
                setattr(white_user, rd_field, new_wp.rd)
                setattr(white_user, vol_field, new_wp.vol)
                setattr(black_user, elo_field, int(new_bp.rating))
                setattr(black_user, rd_field, new_bp.rd)
                setattr(black_user, vol_field, new_bp.vol)
                white_after = int(new_wp.rating)
                black_after = int(new_bp.rating)

            # Win/loss/draw stats for any authenticated human in the game.
            for user, score in ((white_user, w_score), (black_user, b_score)):
                if user is None:
                    continue
                if score == 1.0:
                    user.wins += 1
                elif score == 0.0:
                    user.losses += 1
                else:
                    user.draws += 1

            status = {
                "white": GameStatus.WHITE_WON,
                "black": GameStatus.BLACK_WON,
            }.get(result, GameStatus.DRAW)
            winner_id = None
            if result == "white" and white_user:
                winner_id = white_user.id
            elif result == "black" and black_user:
                winner_id = black_user.id

            try:
                tc_enum = TimeControl(self.time_control)
            except ValueError:
                tc_enum = TimeControl.RAPID_10_0

            game = Game(
                id=uuid.UUID(self.game_id),
                white_player_id=self.white.user_id,
                black_player_id=self.black.user_id,
                white_display_name=self.white.display_name[:64],
                black_display_name=self.black.display_name[:64],
                is_rated=rated,
                is_vs_bot=self.black.is_bot,
                bot_level=self.black.bot_level if self.black.is_bot else None,
                status=status,
                time_control=tc_enum,
                pgn=pgn_str,
                winner_id=winner_id,
                white_elo_before=white_before,
                black_elo_before=black_before,
                white_elo_after=white_after,
                black_elo_after=black_after,
                ended_at=datetime.now(timezone.utc),
            )
            db.add(game)

            if rated:
                db.add(RatingHistory(
                    user_id=white_user.id, game_id=game.id,
                    old_rating=white_before, new_rating=white_after,
                    rating_change=white_delta,
                ))
                db.add(RatingHistory(
                    user_id=black_user.id, game_id=game.id,
                    old_rating=black_before, new_rating=black_after,
                    rating_change=black_delta,
                ))

            await db.commit()

        return white_delta, black_delta

    def _schedule_cleanup(self):
        """Drop the finished session from the registry after a grace TTL."""
        async def _cleanup():
            try:
                await asyncio.sleep(FINISHED_SESSION_TTL_SECONDS)
            except asyncio.CancelledError:
                return
            active_sessions.pop(self.game_id, None)
            logger.info(f"Cleaned up finished session {self.game_id}")

        self._cleanup_task = asyncio.create_task(_cleanup())

    # ─── Reconnection ─────────────────────────────────────────────────────────

    async def handle_disconnect(self, ws):
        """Called when a player's WebSocket closes unexpectedly."""
        color = self.get_ws_color(ws)
        if not color or self.is_over:
            return

        player = self.white if color == "white" else self.black
        player.is_connected = False
        player.ws = None

        # Notify opponent.
        opponent = self.opponent_of(color)
        if opponent.ws:
            await manager.send_json(
                opponent.ws,
                proto.msg_opponent_disconnected(RECONNECT_GRACE_SECONDS)
            )

        # Start (or replace) the grace-period countdown for this color.
        existing = self._reconnect_tasks.get(color)
        if existing:
            existing.cancel()
        self._reconnect_tasks[color] = asyncio.create_task(self._reconnect_timeout(color))

    async def _reconnect_timeout(self, color: str):
        """If the player doesn't reconnect within the grace period, they forfeit."""
        try:
            await asyncio.sleep(RECONNECT_GRACE_SECONDS)
        except asyncio.CancelledError:
            return  # Player reconnected — task was cancelled.
        if self.is_over:
            return
        winner = "black" if color == "white" else "white"
        await self._finish_game(winner, "abandonment")

    async def handle_reconnect(self, ws, color: str):
        """Called when a player reconnects to an ongoing game."""
        player = self.white if color == "white" else self.black
        player.ws = ws
        player.is_connected = True

        # Cancel the grace period.
        task = self._reconnect_tasks.pop(color, None)
        if task:
            task.cancel()

        white_t, black_t = self._snapshot()
        await manager.send_json(ws, proto.msg_game_update(
            fen=self.board.fen(),
            last_move_uci=self.board.peek().uci() if self.board.move_stack else "",
            white_time=white_t,
            black_time=black_t,
            turn=self.current_color,
            check=self.board.is_check(),
        ))

        # Notify opponent.
        opponent = self.opponent_of(color)
        if opponent.ws:
            await manager.send_json(opponent.ws, proto.msg_opponent_reconnected())

    # ─── Start ────────────────────────────────────────────────────────────────

    async def start(self):
        """Send game_start to both players and begin the clock (idempotent)."""
        if self.started or self.is_over:
            return
        self.started = True

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

        self._start_clock()
        logger.info(f"Game {self.game_id} started: "
                    f"{self.white.display_name} vs {self.black.display_name}")


# ─── Active Sessions Registry ─────────────────────────────────────────────────

# game_id -> GameSession
active_sessions: dict[str, GameSession] = {}
