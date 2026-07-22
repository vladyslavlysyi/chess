import { useEffect, useCallback } from 'react';
import { useGameStore } from '../store/gameStore';
import type { WsMessage, Color } from '../types';

const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const WS_BASE = import.meta.env.PROD ? `${protocol}//${window.location.host}` : (import.meta.env.VITE_WS_URL || `${protocol}//${window.location.host}`);

export function useLobbySocket() {
  const { setLobbySocket, setQueued, startGame, setSocket } = useGameStore();

  const connect = useCallback((token?: string) => {
    const url = token
      ? `${WS_BASE}/ws/lobby?token=${token}`
      : `${WS_BASE}/ws/lobby`;

    const ws = new WebSocket(url);
    setLobbySocket(ws);

    ws.onmessage = (event) => {
      const msg: WsMessage = JSON.parse(event.data);

      if (msg.type === 'queued') {
        setQueued(msg.position);
      } else if (msg.type === 'game_ready') {
        // Close lobby socket, open game socket
        ws.close();
        setLobbySocket(null);
        connectGameSocket(msg.game_id, msg.color, token);
      }
    };

    ws.onerror = (e) => console.error('Lobby WS error', e);

    return ws;
  }, []);

  const connectGameSocket = useCallback(
    (gameId: string, _color: Color, token?: string) => {
      const url = token
        ? `${WS_BASE}/ws/${gameId}?token=${token}`
        : `${WS_BASE}/ws/${gameId}`;

      const ws = new WebSocket(url);
      setSocket(ws);

      ws.onmessage = (event) => {
        const msg: WsMessage = JSON.parse(event.data);
        handleGameMessage(msg);
      };

      ws.onerror = (e) => console.error('Game WS error', e);
      ws.onclose = () => console.log('Game WS closed');

      // Keepalive ping every 25s
      const pingInterval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'ping' }));
        }
      }, 25000);

      ws.onclose = () => clearInterval(pingInterval);
    },
    []
  );

  const handleGameMessage = useCallback((msg: WsMessage) => {
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
    }
  }, []);

  return { connect, connectGameSocket };
}
