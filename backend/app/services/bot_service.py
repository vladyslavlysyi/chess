"""
Stockfish Bot Service.

Wraps the stockfish binary with configurable:
  - Skill Level (0–20) + UCI_LimitStrength / UCI_Elo: jointly control playing strength.
  - Adaptive move time (ms): scales with skill level so weak bots think less.
  - Persistent engine process per game session: BotEngine is created once at
    game start and closed when the game ends, NOT recreated on every move.

Usage (in game_service.py):
    engine = BotEngine(skill_level=5)      # created at game start
    uci    = engine.get_move(board)        # called on every bot turn
    engine.close()                         # called at game end

Runs synchronously — callers must use asyncio.to_thread().
"""
import chess
import logging
from typing import Optional

logger = logging.getLogger(__name__)

# Skill level (0–20) → approximate ELO.
# Used both as a lookup table and as the UCI_Elo value passed to Stockfish.
SKILL_TO_ELO: dict[int, int] = {
    0: 400,  1: 600,  2: 700,  3: 800,  4: 900,
    5: 1000, 6: 1100, 7: 1200, 8: 1400, 9: 1600,
    10: 1800, 11: 1900, 12: 2000, 13: 2100, 14: 2200,
    15: 2300, 16: 2400, 17: 2500, 18: 2600, 19: 2700, 20: 2800,
}

# Adaptive move-time budget per skill level (milliseconds).
# Weak bots think briefly so they don't feel artificially slow;
# strong bots are given more time to find deeper lines.
_SKILL_MOVE_TIME_MS: dict[int, int] = {
    0: 100,  1: 100,  2: 100,  3: 100,   # beginner
    4: 200,  5: 200,  6: 200,  7: 200,   # casual
    8: 400,  9: 400, 10: 400, 11: 400,   # intermediate
    12: 800, 13: 800, 14: 800, 15: 800,  # advanced
    16: 1500, 17: 1500, 18: 1500,        # expert
    19: 2500, 20: 2500,                  # master
}


def _move_time_for(skill_level: int) -> int:
    """Return the move-time budget (ms) for a given skill level."""
    return _SKILL_MOVE_TIME_MS.get(max(0, min(20, skill_level)), 400)


class BotEngine:
    """
    Long-lived Stockfish wrapper — one instance per game session.

    Create once at game start, call get_move() for every bot turn,
    call close() when the game ends.  Do NOT recreate per move.
    """

    def __init__(self, skill_level: int = 10):
        self.skill_level = max(0, min(20, skill_level))
        self.move_time_ms = _move_time_for(self.skill_level)
        self._engine = None
        self._init_engine()

    # ------------------------------------------------------------------
    # Initialisation
    # ------------------------------------------------------------------

    def _init_engine(self) -> None:
        try:
            from stockfish import Stockfish
            from app.config import get_settings
            settings = get_settings()

            uci_elo = SKILL_TO_ELO[self.skill_level]

            self._engine = Stockfish(
                path=settings.STOCKFISH_PATH,
                parameters={
                    # Skill Level: internal Stockfish search randomisation (0–20).
                    "Skill Level": self.skill_level,
                    # UCI_LimitStrength + UCI_Elo: separate Stockfish ELO-clamp
                    # mechanism that caps the engine's effective rating.
                    # Combined with Skill Level this gives more realistic weak play.
                    "UCI_LimitStrength": True,
                    "UCI_Elo": uci_elo,
                    "Threads": 1,
                    "Hash": 16,  # MB — keep small for concurrent bot games
                },
            )
            logger.info(
                f"BotEngine init: skill={self.skill_level}, "
                f"UCI_Elo={uci_elo}, move_time={self.move_time_ms}ms"
            )
        except Exception as exc:
            logger.warning(
                f"Stockfish init failed: {exc}. "
                "Falling back to python-chess minimax."
            )
            self._engine = None

    # ------------------------------------------------------------------
    # Move generation
    # ------------------------------------------------------------------

    def get_move(self, board: chess.Board) -> Optional[str]:
        """
        Return the best move UCI string for the given position.
        Falls back to minimax if Stockfish is unavailable.
        """
        if self._engine is not None:
            return self._stockfish_move(board)
        return self._minimax_move(board)

    def _stockfish_move(self, board: chess.Board) -> Optional[str]:
        try:
            self._engine.set_fen_position(board.fen())
            return self._engine.get_best_move_time(self.move_time_ms)
        except Exception as exc:
            logger.error(f"Stockfish move error: {exc}")
            return self._minimax_move(board)

    def _minimax_move(self, board: chess.Board) -> Optional[str]:
        """Fallback: simple minimax with alpha-beta pruning."""
        depth = max(1, self.skill_level // 4)
        _, move = _minimax(board.copy(), depth, -float("inf"), float("inf"),
                           board.turn == chess.WHITE)
        return move.uci() if move else None

    # ------------------------------------------------------------------
    # Cleanup — safe process termination (no direct __del__ call)
    # ------------------------------------------------------------------

    def close(self) -> None:
        """
        Terminate the Stockfish subprocess cleanly.

        Preferred path: close stdin and wait for the child process to exit
        (the stockfish library exposes the Popen object as ``_stockfish``).
        Fallback: drop the reference and let GC handle it via __del__.
        Never calls __del__ directly — that risks double-free and exceptions.
        """
        if self._engine is None:
            return
        try:
            proc = getattr(self._engine, "_stockfish", None)
            if proc is not None:
                try:
                    proc.stdin.close()
                except Exception:
                    pass
                try:
                    proc.wait(timeout=2)
                except Exception:
                    try:
                        proc.kill()
                    except Exception:
                        pass
            else:
                # Fallback: drop the reference; GC calls __del__ normally.
                pass
        except Exception as exc:
            logger.warning(f"BotEngine.close() error: {exc}")
        finally:
            self._engine = None
            logger.debug("BotEngine closed.")


# ─── Minimax Fallback ─────────────────────────────────────────────────────────

PIECE_VALUES = {
    chess.PAWN: 100,
    chess.KNIGHT: 320,
    chess.BISHOP: 330,
    chess.ROOK: 500,
    chess.QUEEN: 900,
    chess.KING: 20000,
}


def _evaluate(board: chess.Board) -> int:
    if board.is_checkmate():
        return -99999 if board.turn == chess.WHITE else 99999
    if board.is_stalemate() or board.is_insufficient_material():
        return 0
    score = 0
    for piece_type, value in PIECE_VALUES.items():
        score += value * (
            len(board.pieces(piece_type, chess.WHITE)) -
            len(board.pieces(piece_type, chess.BLACK))
        )
    return score


def _minimax(board: chess.Board, depth: int, alpha: float, beta: float,
             maximizing: bool):
    if depth == 0 or board.is_game_over():
        return _evaluate(board), None

    best_move = None
    if maximizing:
        best_val = -float("inf")
        for move in board.legal_moves:
            board.push(move)
            val, _ = _minimax(board, depth - 1, alpha, beta, False)
            board.pop()
            if val > best_val:
                best_val, best_move = val, move
            alpha = max(alpha, val)
            if beta <= alpha:
                break
        return best_val, best_move
    else:
        best_val = float("inf")
        for move in board.legal_moves:
            board.push(move)
            val, _ = _minimax(board, depth - 1, alpha, beta, True)
            board.pop()
            if val < best_val:
                best_val, best_move = val, move
            beta = min(beta, val)
            if beta <= alpha:
                break
        return best_val, best_move


# ─── Public helpers ───────────────────────────────────────────────────────────

def skill_level_from_elo(target_elo: int) -> int:
    """Convert a target ELO to the closest Stockfish skill level (0–20)."""
    for level in range(20, -1, -1):
        if SKILL_TO_ELO[level] <= target_elo:
            return level
    return 0


def get_bot_move(board: chess.Board, skill_level: int = 10) -> Optional[str]:
    """
    One-shot synchronous helper (creates + destroys a BotEngine).
    Kept for backwards-compatibility and testing.
    Production code should use a persistent BotEngine instance on the session.

    Call via asyncio.to_thread() from async code.
    """
    if not list(board.legal_moves):
        return None
    engine = BotEngine(skill_level=skill_level)
    try:
        return engine.get_move(board)
    finally:
        engine.close()
