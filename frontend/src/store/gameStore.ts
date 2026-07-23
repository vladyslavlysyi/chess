import { create } from 'zustand';
import { Chess } from 'chess.js';
import type { Color, GameResult, GameReason, MoveRecord } from '../types';

// Local clock tick granularity (ms). Server time_update/game_update override.
const CLOCK_TICK_MS = 200;

interface GameState {
  // Connection
  socket: WebSocket | null;
  lobbySocket: WebSocket | null;
  gameId: string | null;
  seatToken: string | null;   // secret used to (re)attach to our seat
  token: string | null;       // access token used for this game (for reconnect)

  // Identity in this game
  myColor: Color | null;
  myDisplayName: string;
  opponentName: string;
  opponentElo: number;

  // Board
  game: Chess;
  startFen: string;
  fen: string;
  lastMoveUci: string | null;
  isCheck: boolean;

  // Move history + review
  moves: MoveRecord[];
  selectedPly: number | null; // null = follow live; else index into `moves`

  // Clocks
  whiteTime: number;
  blackTime: number;
  turn: Color;

  // Status
  phase: 'idle' | 'lobby' | 'queued' | 'playing' | 'over' | 'review';
  queuePosition: number;
  timeControl: string;
  isRated: boolean;

  // Game over
  result: GameResult | null;
  reason: GameReason | null;
  whiteEloDelta: number;
  blackEloDelta: number;
  pgn: string | null;

  // Draw offer / connection status
  drawOffered: boolean;
  opponentDisconnected: boolean;
  opponentGraceSeconds: number;
  lastError: string | null;
  privateRoomCode: string | null; // For private rooms

  // internal
  _clockInterval: ReturnType<typeof setInterval> | null;

  // Chat
  chatMessages: { sender: string; text: string }[];
  sendChatMessage: (text: string) => void;
  addChatMessage: (msg: { sender: string; text: string }) => void;

  // Evaluation
  evaluation: number | null;
  bestMove: string | null;
  setEvaluation: (evalValue: number | null, bestMove?: string | null) => void;

  // Analysis
  analysis: any | null; // using any to avoid circular dependency or complex imports, or we can import it
  analysisProgress: number;
  setAnalysis: (analysis: any | null) => void;
  setAnalysisProgress: (progress: number) => void;

  // Actions
  setLobbySocket: (ws: WebSocket | null) => void;
  setSocket: (ws: WebSocket | null) => void;
  setSeat: (gameId: string, seatToken: string, token: string | null) => void;
  setPrivateRoomCode: (code: string | null) => void;
  startGame: (data: {
    gameId: string; color: Color; opponent: string; opponentElo: number;
    fen: string; timeControl: string; whiteTime: number; blackTime: number;
  }) => void;
  applyUpdate: (fen: string, lastMove: string, wt: number, bt: number, turn: Color, check: boolean) => void;
  updateTime: (wt: number, bt: number) => void;
  endGame: (result: GameResult, reason: GameReason, wt: number, bt: number, pgn: string, wDelta: number, bDelta: number) => void;
  setQueued: (position: number) => void;
  setDrawOffered: (v: boolean) => void;
  setOpponentDisconnected: (v: boolean, grace?: number) => void;
  setError: (detail: string | null) => void;
  selectPly: (ply: number | null) => void;
  sendMove: (uci: string) => void;
  sendResign: () => void;
  sendDrawOffer: () => void;
  sendDrawResponse: (accept: boolean) => void;
  loadReplay: (gameDetail: any, myColor: Color) => void;
  reset: () => void;
}

const initialChess = new Chess();

function uciToMove(uci: string) {
  return {
    from: uci.slice(0, 2),
    to: uci.slice(2, 4),
    promotion: uci.length > 4 ? uci[4] : undefined,
  };
}

export const useGameStore = create<GameState>((set, get) => ({
  socket: null,
  lobbySocket: null,
  gameId: null,
  seatToken: null,
  token: null,
  myColor: null,
  myDisplayName: 'Guest',
  opponentName: 'Waiting...',
  opponentElo: 1200,
  game: initialChess,
  startFen: initialChess.fen(),
  fen: initialChess.fen(),
  lastMoveUci: null,
  isCheck: false,
  moves: [],
  selectedPly: null,
  whiteTime: 600,
  blackTime: 600,
  turn: 'white',
  phase: 'idle',
  queuePosition: 0,
  timeControl: '10+0',
  isRated: false,
  result: null,
  reason: null,
  whiteEloDelta: 0,
  blackEloDelta: 0,
  pgn: null,
  drawOffered: false,
  opponentDisconnected: false,
  opponentGraceSeconds: 0,
  lastError: null,
  privateRoomCode: null,
  _clockInterval: null,
  chatMessages: [],
  evaluation: null,
  bestMove: null,
  analysis: null,
  analysisProgress: 0,

  setLobbySocket: (ws) => set({ lobbySocket: ws }),
  setSocket: (ws) => set({ socket: ws }),
  setEvaluation: (v, bestMove = null) => set({ evaluation: v, bestMove }),
  setAnalysis: (analysis) => set({ analysis }),
  setAnalysisProgress: (analysisProgress) => set({ analysisProgress }),
  setSeat: (gameId, seatToken, token) => set({ gameId, seatToken, token }),
  setPrivateRoomCode: (code) => set({ privateRoomCode: code, phase: code ? 'lobby' : get().phase }),

  startGame: ({ gameId, color, opponent, opponentElo, fen, timeControl, whiteTime, blackTime }) => {
    const game = new Chess();
    try { game.load(fen); } catch { /* keep default */ }

    // (Re)start the smooth local clock ticker.
    const existing = get()._clockInterval;
    if (existing) clearInterval(existing);
    const interval = setInterval(() => {
      const s = get();
      if (s.phase !== 'playing') return;
      if (s.turn === 'white') {
        set({ whiteTime: Math.max(0, s.whiteTime - CLOCK_TICK_MS / 1000) });
      } else {
        set({ blackTime: Math.max(0, s.blackTime - CLOCK_TICK_MS / 1000) });
      }
    }, CLOCK_TICK_MS);

    set({
      gameId, myColor: color, opponentName: opponent, opponentElo,
      game, startFen: fen, fen, timeControl, whiteTime, blackTime,
      turn: 'white', phase: 'playing', result: null, reason: null,
      lastMoveUci: null, isCheck: false, drawOffered: false,
      opponentDisconnected: false, moves: [], selectedPly: null,
      lastError: null, _clockInterval: interval, chatMessages: [],
      evaluation: null, bestMove: null,
    });
  },

  applyUpdate: (fen, lastMove, wt, bt, turn, check) => {
    const prev = get();
    let moves = prev.moves;

    // Derive SAN by replaying the move from the previous position. If the move
    // does not chain (e.g. a reconnect snapshot), keep the existing history.
    if (lastMove && lastMove.length >= 4) {
      try {
        const replay = new Chess(prev.fen);
        const mv = replay.move(uciToMove(lastMove));
        if (mv && replay.fen() === fen) {
          moves = [...moves, { san: mv.san, uci: lastMove, fen }];
        }
      } catch { /* non-chaining update — leave history as-is */ }
    }

    const game = new Chess();
    try { game.load(fen); } catch { /* ignore */ }

    set({
      game, fen, lastMoveUci: lastMove, whiteTime: wt, blackTime: bt,
      turn, isCheck: check, moves, selectedPly: null,
    });
  },

  updateTime: (wt, bt) => set({ whiteTime: wt, blackTime: bt }),

  endGame: (result, reason, wt, bt, pgn, wDelta, bDelta) => {
    const existing = get()._clockInterval;
    if (existing) clearInterval(existing);
    
    // If we receive a PGN (e.g. from a late reconnect to a finished game)
    // we should parse it to ensure the board and moves list are populated.
    const updates: any = {
      phase: 'over', result, reason, whiteTime: wt, blackTime: bt,
      pgn, whiteEloDelta: wDelta, blackEloDelta: bDelta,
      opponentDisconnected: false, _clockInterval: null,
    };
    
    if (pgn) {
      try {
        const chess = new Chess();
        chess.loadPgn(pgn, { strict: false });
        updates.game = chess;
        updates.fen = chess.fen();
        
        const moves: MoveRecord[] = [];
        const history = chess.history({ verbose: true });
        history.forEach((m) => {
          moves.push({
            san: m.san,
            uci: m.from + m.to + (m.promotion || ''),
            fen: m.after,
          });
        });
        updates.moves = moves;
      } catch (e) {
        console.error("Failed to parse PGN in endGame", e);
      }
    }
    
    set(updates);
  },

  setQueued: (position) => set({ phase: 'queued', queuePosition: position }),
  setDrawOffered: (v) => set({ drawOffered: v }),
  setOpponentDisconnected: (v, grace = 0) =>
    set({ opponentDisconnected: v, opponentGraceSeconds: grace }),
  setError: (detail) => set({ lastError: detail }),
  selectPly: (ply) => set({ selectedPly: ply }),

  sendMove: (uci) => {
    const { socket } = get();
    socket?.send(JSON.stringify({ type: 'move', uci }));
  },

  sendChatMessage: (text) => {
    const { socket } = get();
    socket?.send(JSON.stringify({ type: 'chat', text }));
  },

  addChatMessage: (msg) => {
    set((state) => ({ chatMessages: [...state.chatMessages, msg] }));
  },

  sendResign: () => {
    get().socket?.send(JSON.stringify({ type: 'resign' }));
  },

  sendDrawOffer: () => {
    get().socket?.send(JSON.stringify({ type: 'offer_draw' }));
  },

  sendDrawResponse: (accept: boolean) => {
    const type = accept ? 'accept_draw' : 'decline_draw';
    get().socket?.send(JSON.stringify({ type }));
    set({ drawOffered: false });
  },

  loadReplay: (gameDetail: any, myColor: Color) => {
    // We assume gameDetail contains the full PGN in gameDetail.pgn
    const chess = new Chess();
    const moves: MoveRecord[] = [];
    if (gameDetail.pgn) {
      try {
        // use strict: false just in case
        chess.loadPgn(gameDetail.pgn, { strict: false });
        const history = chess.history({ verbose: true });
        history.forEach((m) => {
          moves.push({
            san: m.san,
            uci: m.from + m.to + (m.promotion || ''),
            fen: m.after,
          });
        });
      } catch (e) {
        console.error("Failed to load PGN for replay:", e);
      }
    }

    set({
      phase: 'review',
      myColor,
      opponentName: myColor === 'white' ? gameDetail.black_display_name : gameDetail.white_display_name,
      myDisplayName: myColor === 'white' ? gameDetail.white_display_name : gameDetail.black_display_name,
      opponentElo: myColor === 'white' ? (gameDetail.black_elo_before || 0) : (gameDetail.white_elo_before || 0),
      game: chess,
      fen: chess.fen(),
      moves,
      selectedPly: null,
      result: gameDetail.status,
      pgn: gameDetail.pgn,
      isRated: gameDetail.is_rated,
      timeControl: gameDetail.time_control,
      whiteTime: 0,
      blackTime: 0,
      chatMessages: [],
      evaluation: null,
      bestMove: null,
    });
  },

  reset: () => {
    const { socket, lobbySocket, _clockInterval } = get();
    socket?.close();
    lobbySocket?.close();
    if (_clockInterval) clearInterval(_clockInterval);
    const g = new Chess();
    set({
      socket: null, lobbySocket: null, gameId: null, seatToken: null, token: null,
      myColor: null, game: g, startFen: g.fen(), fen: g.fen(), phase: 'idle',
      result: null, reason: null, lastMoveUci: null, moves: [], selectedPly: null,
      drawOffered: false, opponentDisconnected: false, lastError: null,
      privateRoomCode: null,
      _clockInterval: null,
      chatMessages: [],
      evaluation: null,
      bestMove: null,
    });
  },
}));
