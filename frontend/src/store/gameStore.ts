import { create } from 'zustand';
import { Chess } from 'chess.js';
import type { Color, GameResult, GameReason } from '../types';

interface GameState {
  // Connection
  socket: WebSocket | null;
  lobbySocket: WebSocket | null;
  gameId: string | null;

  // Identity in this game
  myColor: Color | null;
  myDisplayName: string;
  opponentName: string;
  opponentElo: number;

  // Board
  game: Chess;
  fen: string;
  lastMoveUci: string | null;
  isCheck: boolean;

  // Clocks
  whiteTime: number;
  blackTime: number;
  turn: Color;

  // Status
  phase: 'idle' | 'lobby' | 'queued' | 'playing' | 'over';
  queuePosition: number;
  timeControl: string;
  isRated: boolean;

  // Game over
  result: GameResult | null;
  reason: GameReason | null;
  whiteEloDelta: number;
  blackEloDelta: number;
  pgn: string | null;

  // Draw offer
  drawOffered: boolean;
  opponentDisconnected: boolean;
  opponentGraceSeconds: number;

  // Actions
  setLobbySocket: (ws: WebSocket | null) => void;
  setSocket: (ws: WebSocket | null) => void;
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
  sendMove: (uci: string) => void;
  sendResign: () => void;
  sendDrawOffer: () => void;
  sendDrawResponse: (accept: boolean) => void;
  reset: () => void;
}

const initialChess = new Chess();

export const useGameStore = create<GameState>((set, get) => ({
  socket: null,
  lobbySocket: null,
  gameId: null,
  myColor: null,
  myDisplayName: 'You',
  opponentName: '',
  opponentElo: 1200,
  game: initialChess,
  fen: initialChess.fen(),
  lastMoveUci: null,
  isCheck: false,
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

  setLobbySocket: (ws) => set({ lobbySocket: ws }),
  setSocket: (ws) => set({ socket: ws }),

  startGame: ({ gameId, color, opponent, opponentElo, fen, timeControl, whiteTime, blackTime }) => {
    const game = new Chess();
    game.load(fen);
    set({
      gameId, myColor: color, opponentName: opponent, opponentElo,
      game, fen, timeControl, whiteTime, blackTime,
      turn: 'white', phase: 'playing', result: null, reason: null,
      lastMoveUci: null, isCheck: false, drawOffered: false,
      opponentDisconnected: false,
    });
  },

  applyUpdate: (fen, lastMove, wt, bt, turn, check) => {
    const game = new Chess();
    game.load(fen);
    set({ game, fen, lastMoveUci: lastMove, whiteTime: wt, blackTime: bt, turn, isCheck: check });
  },

  updateTime: (wt, bt) => set({ whiteTime: wt, blackTime: bt }),

  endGame: (result, reason, wt, bt, pgn, wDelta, bDelta) =>
    set({
      phase: 'over', result, reason, whiteTime: wt, blackTime: bt,
      pgn, whiteEloDelta: wDelta, blackEloDelta: bDelta,
    }),

  setQueued: (position) => set({ phase: 'queued', queuePosition: position }),
  setDrawOffered: (v) => set({ drawOffered: v }),
  setOpponentDisconnected: (v, grace = 0) =>
    set({ opponentDisconnected: v, opponentGraceSeconds: grace }),

  sendMove: (uci) => {
    const { socket } = get();
    socket?.send(JSON.stringify({ type: 'move', uci }));
  },

  sendResign: () => {
    const { socket } = get();
    socket?.send(JSON.stringify({ type: 'resign' }));
  },

  sendDrawOffer: () => {
    const { socket } = get();
    socket?.send(JSON.stringify({ type: 'offer_draw' }));
  },

  sendDrawResponse: (accept) => {
    const { socket } = get();
    const type = accept ? 'accept_draw' : 'decline_draw';
    socket?.send(JSON.stringify({ type }));
    set({ drawOffered: false });
  },

  reset: () => {
    const { socket, lobbySocket } = get();
    socket?.close();
    lobbySocket?.close();
    const g = new Chess();
    set({
      socket: null, lobbySocket: null, gameId: null, myColor: null,
      game: g, fen: g.fen(), phase: 'idle', result: null, reason: null,
      lastMoveUci: null, drawOffered: false, opponentDisconnected: false,
    });
  },
}));
