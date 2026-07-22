// Types shared across the application
export type Color = 'white' | 'black';
export type GameResult = 'white' | 'black' | 'draw';
export type GameReason =
  | 'checkmate' | 'timeout' | 'resignation' | 'stalemate'
  | 'insufficient_material' | 'agreement' | 'abandonment'
  | 'timeout_insufficient' | '75_move_rule' | 'fivefold_repetition';

export interface User {
  id: string;
  username: string;
  email: string;
  elo_rapid: number;
  elo_blitz: number;
  elo_bullet: number;
  wins: number;
  losses: number;
  draws: number;
  created_at: string;
}

export interface GameSummary {
  id: string;
  white_display_name: string;
  black_display_name: string;
  status: string;
  time_control: string;
  is_rated: boolean;
  white_elo_before: number | null;
  black_elo_before: number | null;
  white_elo_after: number | null;
  black_elo_after: number | null;
  created_at: string;
  ended_at: string | null;
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
}

// WebSocket message types
export interface WsMsgGameStart {
  type: 'game_start';
  color: Color;
  opponent: string;
  opponent_elo: number;
  fen: string;
  time_control: string;
  white_time: number;
  black_time: number;
  game_id: string;
}

export interface WsMsgGameUpdate {
  type: 'game_update';
  fen: string;
  last_move_uci: string;
  white_time: number;
  black_time: number;
  turn: Color;
  check: boolean;
}

export interface WsMsgGameOver {
  type: 'game_over';
  result: GameResult;
  reason: GameReason;
  white_time: number;
  black_time: number;
  pgn: string;
  white_elo_delta: number;
  black_elo_delta: number;
}

export interface WsMsgTimeUpdate {
  type: 'time_update';
  white_time: number;
  black_time: number;
}

export interface WsMsgError {
  type: 'error';
  detail: string;
}

export interface WsMsgQueued {
  type: 'queued';
  position: number;
}

export interface WsMsgGameReady {
  type: 'game_ready';
  game_id: string;
  color: Color;
  seat_token: string;
}

// A single played half-move, kept for the interactive move list / review.
export interface MoveRecord {
  san: string;
  uci: string;
  fen: string; // position AFTER this move
}

export type WsMessage =
  | WsMsgGameStart | WsMsgGameUpdate | WsMsgGameOver
  | WsMsgTimeUpdate | WsMsgError | WsMsgQueued | WsMsgGameReady
  | { type: 'opponent_disconnected'; grace_seconds: number }
  | { type: 'opponent_reconnected' }
  | { type: 'draw_offered' }
  | { type: 'draw_declined' }
  | { type: 'pong' }
  | { type: 'cancelled' };

export type TimeControl =
  | '1+0' | '2+1' | '3+0' | '3+2' | '5+0' | '5+3'
  | '10+0' | '10+5' | '15+10';
