import { useCallback } from 'react';
import { useGameStore } from '../store/gameStore';
import type { WsMessage } from '../types';

const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const WS_BASE = import.meta.env.PROD
  ? `${protocol}//${window.location.host}`
  : (import.meta.env.VITE_WS_URL || `${protocol}//${window.location.host}`);

const PING_INTERVAL_MS = 25000;
const MAX_RECONNECT_ATTEMPTS = 6;

// Module-level game-socket lifecycle state. Kept out of React so it survives the
// Lobby component unmounting when the app navigates to the game view.
let gamePingInterval: ReturnType<typeof setInterval> | null = null;
let gameReconnectTimer: ReturnType<typeof setTimeout> | null = null;
let gameReconnectAttempts = 0;

function clearGameTimers() {
  if (gamePingInterval) { clearInterval(gamePingInterval); gamePingInterval = null; }
  if (gameReconnectTimer) { clearTimeout(gameReconnectTimer); gameReconnectTimer = null; }
}

function buildGameUrl(gameId: string, seatToken: string | null, token: string | null): string {
  const params = new URLSearchParams();
  if (seatToken) params.set('seat_token', seatToken);
  if (token) params.set('token', token);
  const qs = params.toString();
  return `${WS_BASE}/ws/${gameId}${qs ? `?${qs}` : ''}`;
}

function handleGameMessage(msg: WsMessage) {
  const store = useGameStore.getState();
  switch (msg.type) {
    case 'game_start':
      store.startGame({
        gameId: msg.game_id,
        color: msg.color,
        opponent: msg.opponent,
        opponentElo: msg.opponent_elo,
        fen: msg.fen,
        timeControl: msg.time_control,
        whiteTime: msg.white_time,
        blackTime: msg.black_time,
      });
      break;
    case 'game_update':
      store.applyUpdate(msg.fen, msg.last_move_uci, msg.white_time, msg.black_time, msg.turn, msg.check);
      break;
    case 'time_update':
      store.updateTime(msg.white_time, msg.black_time);
      break;
    case 'game_over':
      store.endGame(msg.result, msg.reason, msg.white_time, msg.black_time, msg.pgn, msg.white_elo_delta, msg.black_elo_delta);
      break;
    case 'draw_offered':
      store.setDrawOffered(true);
      break;
    case 'draw_declined':
      store.setDrawOffered(false);
      break;
    case 'opponent_disconnected':
      store.setOpponentDisconnected(true, msg.grace_seconds);
      break;
    case 'opponent_reconnected':
      store.setOpponentDisconnected(false);
      break;
    case 'error':
      store.setError(msg.detail);
      break;
    // 'pong' — keepalive ack, nothing to do.
  }
}

function connectGameSocket(gameId: string, seatToken: string | null, token: string | null) {
  clearGameTimers();
  const ws = new WebSocket(buildGameUrl(gameId, seatToken, token));
  useGameStore.getState().setSocket(ws);

  ws.onopen = () => {
    gameReconnectAttempts = 0;
    gamePingInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'ping' }));
    }, PING_INTERVAL_MS);
  };

  ws.onmessage = (event) => {
    let msg: WsMessage;
    try {
      msg = JSON.parse(event.data);
    } catch {
      return; // ignore malformed frames
    }
    handleGameMessage(msg);
  };

  ws.onerror = () => { /* onclose will handle recovery */ };

  ws.onclose = () => {
    if (gamePingInterval) { clearInterval(gamePingInterval); gamePingInterval = null; }

    const store = useGameStore.getState();
    // Only attempt recovery while a game is actively in progress.
    if (store.phase !== 'playing' || !store.gameId) return;
    if (gameReconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      store.setError('Connection lost. Please return to the lobby.');
      return;
    }
    gameReconnectAttempts += 1;
    const delay = Math.min(1000 * 2 ** (gameReconnectAttempts - 1), 8000);
    gameReconnectTimer = setTimeout(() => {
      const s = useGameStore.getState();
      if (s.phase === 'playing' && s.gameId) {
        connectGameSocket(s.gameId, s.seatToken, s.token);
      }
    }, delay);
  };

  return ws;
}

export function useLobbySocket() {
  const { setLobbySocket } = useGameStore();

  const connect = useCallback((token?: string) => {
    // Close any pre-existing lobby socket to avoid duplicates / leaks.
    const prev = useGameStore.getState().lobbySocket;
    if (prev && (prev.readyState === WebSocket.OPEN || prev.readyState === WebSocket.CONNECTING)) {
      prev.close();
    }

    const url = token ? `${WS_BASE}/ws/lobby?token=${token}` : `${WS_BASE}/ws/lobby`;
    const ws = new WebSocket(url);
    useGameStore.getState().setLobbySocket(ws);

    ws.onmessage = (event) => {
      let msg: WsMessage;
      try {
        msg = JSON.parse(event.data);
      } catch {
        return;
      }
      const store = useGameStore.getState();
      if (msg.type === 'queued') {
        store.setQueued(msg.position);
      } else if (msg.type === 'cancelled') {
        store.reset();
      } else if (msg.type === 'error') {
        store.setError(msg.detail);
      } else if (msg.type === 'game_ready') {
        // Remember our seat, then move from the lobby socket to the game socket.
        store.setSeat(msg.game_id, msg.seat_token, token ?? null);
        ws.close();
        store.setLobbySocket(null);
        gameReconnectAttempts = 0;
        connectGameSocket(msg.game_id, msg.seat_token, token ?? null);
      }
    };

    ws.onerror = () => { /* surfaced to the user via lobby UI state */ };

    return ws;
  }, [setLobbySocket]);

  return { connect, connectGameSocket };
}
