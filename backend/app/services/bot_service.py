"""
Stockfish Bot Service.

Wraps the stockfish binary with configurable:
  - Skill Level (0–20): maps to ELO 400–2800+
  - Time per move (ms): limits thinking time
  - Depth: alternative to time-based limiting

Runs synchronously but called via asyncio.to_thread() to avoid blocking.
"""
import chess
import logging
from typing import Optional

logger = logging.getLogger(__name__)

# Skill level → approximate ELO mapping (rough guide)
SKILL_TO_ELO = {
    0: 400, 1: 600, 2: 700, 3: 800, 4: 900,
    5: 1000, 6: 1100, 7: 1200, 8: 1400, 9: 1600,
    10: 1800, 11: 1900, 12: 2000, 13: 2100, 14: 2200,
    15: 2300, 16: 2400, 17: 2500, 18: 2600, 19: 2700, 20: 2800,
}


class BotEngine:
    """
    Thread-safe Stockfish wrapper.
    One instance is created per bot game session to avoid state contamination.
    """

    def __init__(self, skill_level: int = 10, move_time_ms: int = 300):
        self.skill_level = max(0, min(20, skill_level))
        self.move_time_ms = move_time_ms
        self._engine = None
        self._init_engine()

    def _init_engine(self):
        try:
            from stockfish import Stockfish
            from app.config import get_settings
            settings = get_settings()
            self._engine = Stockfish(
                path=settings.STOCKFISH_PATH,
                parameters={
                    "Skill Level": self.skill_level,
                    "Threads": 1,
                    "Hash": 16,  # MB
                },
            )
        except Exception as e:
            logger.warning(f"Stockfish init failed: {e}. Falling back to python-chess minimax.")
            self._engine = None

    def get_move(self, board: chess.Board) -> Optional[str]:
        """
        Return the best move UCI string for the given board position.
        Falls back to minimax if Stockfish is unavailable.
        """
        if self._engine is not None:
            return self._stockfish_move(board)
        return self._minimax_move(board)

    def _stockfish_move(self, board: chess.Board) -> Optional[str]:
        try:
            self._engine.set_fen_position(board.fen())
            move = self._engine.get_best_move_time(self.move_time_ms)
            return move
        except Exception as e:
            logger.error(f"Stockfish error: {e}")
            return self._minimax_move(board)

    def _minimax_move(self, board: chess.Board) -> Optional[str]:
        """Fallback: simple minimax with alpha-beta pruning (depth based on skill)."""
        depth = max(1, self.skill_level // 4)
        _, move = _minimax(board.copy(), depth, -float("inf"), float("inf"), board.turn == chess.WHITE)
        return move.uci() if move else None


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


def _minimax(board: chess.Board, depth: int, alpha: float, beta: float, maximizing: bool):
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
                best_val = val
                best_move = move
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
                best_val = val
                best_move = move
            beta = min(beta, val)
            if beta <= alpha:
                break
        return best_val, best_move


# ─── Public API ───────────────────────────────────────────────────────────────

def get_bot_move(board: chess.Board, skill_level: int = 10) -> Optional[str]:
    """
    Synchronous function — call via asyncio.to_thread() from async code.
    Returns UCI move string or None if no moves available.
    """
    if not list(board.legal_moves):
        return None
    engine = BotEngine(skill_level=skill_level)
    return engine.get_move(board)


def skill_level_from_elo(target_elo: int) -> int:
    """Convert a target ELO to a Stockfish skill level (0–20)."""
    for level in range(20, -1, -1):
        if SKILL_TO_ELO[level] <= target_elo:
            return level
    return 0
