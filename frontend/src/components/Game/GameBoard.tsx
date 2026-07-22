import React from 'react';
import { useGameStore } from '../../store/gameStore';
import { useAuthStore } from '../../store/authStore';
import { ChessgroundBoard } from './ChessgroundBoard';
import { Chess } from 'chess.js';
import { Flag, Handshake, Home, WifiOff, Radio, ChevronLeft, ChevronRight, SkipBack, SkipForward } from 'lucide-react';
import { Clock } from './Clock';
import { MoveList } from './MoveList';

/** Which stored ELO applies to a given time control. */
function ratingClass(tc: string): 'elo_bullet' | 'elo_blitz' | 'elo_rapid' {
  const initial = parseInt(tc.split('+')[0] || '10', 10);
  if (initial < 3) return 'elo_bullet';
  if (initial < 10) return 'elo_blitz';
  return 'elo_rapid';
}

interface GameBoardProps {
  onLeave: () => void;
}

const RESULT_LABELS: Record<string, string> = {
  white: 'White Wins',
  black: 'Black Wins',
  draw: 'Draw',
};

const REASON_LABELS: Record<string, string> = {
  checkmate: 'by Checkmate',
  timeout: 'on Time',
  resignation: 'by Resignation',
  stalemate: 'by Stalemate',
  insufficient_material: 'Insufficient Material',
  agreement: 'by Agreement',
  abandonment: '— Opponent Abandoned',
  timeout_insufficient: 'Timeout vs. Insufficient Material',
  '75_move_rule': '75-Move Rule',
  fivefold_repetition: 'Fivefold Repetition',
};

export function GameBoard({ onLeave }: GameBoardProps) {
  const {
    fen, myColor, opponentName, opponentElo, whiteTime, blackTime,
    turn, phase, result, reason, drawOffered, opponentDisconnected,
    opponentGraceSeconds, myDisplayName, lastMoveUci, isCheck, timeControl,
    whiteEloDelta, blackEloDelta, moves, selectedPly, selectPly,
    sendMove, sendResign, sendDrawOffer, sendDrawResponse,
  } = useGameStore();
  const { user } = useAuthStore();

  // Position shown on the board: live, or a past ply when reviewing.
  const reviewing = selectedPly !== null;
  const shownFen = reviewing ? moves[selectedPly!]?.fen ?? fen : fen;
  const shownLastMove = reviewing ? moves[selectedPly!]?.uci : (lastMoveUci || undefined);

  const onPieceDrop = React.useCallback((source: string, target: string) => {
    const store = useGameStore.getState();
    if (store.phase !== 'playing' || store.selectedPly !== null) return false;
    const myTurn =
      (store.turn === 'white' && store.myColor === 'white') ||
      (store.turn === 'black' && store.myColor === 'black');
    if (!myTurn) return false;

    let move;
    try {
      move = new Chess(store.fen).move({ from: source, to: target, promotion: 'q' });
    } catch {
      return false;
    }
    if (!move) return false;
    store.sendMove(move.from + move.to + (move.promotion || ''));
    return true;
  }, []);

  const myEloField = ratingClass(timeControl);
  const myElo = user ? (user[myEloField] ?? 1200) : 1200;
  const myDelta = myColor === 'white' ? whiteEloDelta : blackEloDelta;

  // Responsive board sizing: fill available space up to 580px
  const [boardWidth, setBoardWidth] = React.useState(() => Math.min(580, window.innerWidth - 32));
  React.useEffect(() => {
    const handleResize = () => setBoardWidth(Math.min(580, window.innerWidth - 32));
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const opponentTime = myColor === 'white' ? blackTime : whiteTime;
  const myTime       = myColor === 'white' ? whiteTime : blackTime;
  const opponentActive = turn !== myColor && phase === 'playing';
  const myActive       = turn === myColor  && phase === 'playing';

  return (
    <div
      className="min-h-screen flex items-center justify-center p-3 lg:p-6"
      style={{ background: 'var(--color-bg)', color: 'var(--color-fg)' }}
    >
      {/* Ambient glow blobs */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
        <div className="absolute top-0 right-0 w-96 h-96 rounded-full blur-3xl"
             style={{ background: 'var(--color-primary-faint)' }} />
        <div className="absolute bottom-0 left-0 w-96 h-96 rounded-full blur-3xl"
             style={{ background: 'rgba(148,163,184,0.04)' }} />
      </div>

      {/* ── Chess.com style layout: board left, panel right ── */}
      <div className="relative z-10 w-full max-w-5xl flex flex-col lg:flex-row gap-4 items-start justify-center">

        {/* ── Left column: opponent bar + board + my bar ── */}
        <div className="flex flex-col items-center gap-2">
          {/* Opponent bar (top) */}
          <PlayerBar
            name={opponentName}
            elo={opponentElo}
            time={opponentTime}
            isActive={opponentActive}
            boardWidth={boardWidth}
          />

          {/* Chessboard */}
          <div
            className="relative rounded-xl overflow-hidden"
            style={{
              width: boardWidth,
              height: boardWidth,
              boxShadow: '0 8px 40px rgba(0,0,0,0.6)',
              border: '2px solid var(--color-border)',
            }}
          >
            <ChessgroundBoard
              fen={shownFen}
              lastMoveUci={shownLastMove}
              onPieceDrop={onPieceDrop}
              boardOrientation={myColor === 'black' ? 'black' : 'white'}
              movableColor={myColor}
              viewOnly={phase !== 'playing' || reviewing}
              check={isCheck && !reviewing}
            />

            {/* Game-over overlay */}
            {phase === 'over' && (
              <div
                className="absolute inset-0 z-50 backdrop-blur-sm flex items-center justify-center"
                style={{ background: 'rgba(2,6,23,0.75)' }}
              >
                <div
                  className="border rounded-2xl p-8 text-center mx-4"
                  style={{
                    background: 'var(--color-surface)',
                    border: '1px solid var(--color-border-hover)',
                    boxShadow: 'var(--shadow-md)',
                  }}
                >
                  <div className="text-4xl mb-2 font-bold">
                    {result ? RESULT_LABELS[result] : '—'}
                  </div>
                  <p className="mb-2" style={{ color: 'var(--color-muted)' }}>
                    {reason ? REASON_LABELS[reason] : ''}
                  </p>
                  {myColor && (
                    <div className={`text-lg font-bold mt-2 ${myDelta >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {myDelta >= 0 ? '+' : ''}{myDelta} ELO
                    </div>
                  )}
                  <button
                    id="game-over-back-btn"
                    onClick={onLeave}
                    className="mt-6 px-8 py-3 rounded-xl font-bold transition-all flex items-center gap-2 mx-auto text-white bg-[#16A34A] hover:bg-[#15803D] shadow-[0_4px_14px_0_rgba(22,163,74,0.39)] hover:shadow-[0_6px_20px_rgba(22,163,74,0.23)] hover:-translate-y-1"
                  >
                    <Home size={20} /> Back to Lobby
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* My bar (bottom) */}
          <PlayerBar
            name={myDisplayName || user?.username || 'You'}
            elo={myElo}
            time={myTime}
            isActive={myActive}
            boardWidth={boardWidth}
          />
        </div>

        {/* ── Right panel: alerts + move list + controls ── */}
        <div
          className="w-full flex flex-col gap-3"
          style={{ minWidth: '220px', maxWidth: '280px', alignSelf: 'stretch' }}
        >
          {/* Opponent disconnected warning */}
          {opponentDisconnected && (
            <div
              className="rounded-xl px-4 py-3 flex items-center gap-2"
              role="alert"
              style={{
                background: 'var(--color-warning-faint)',
                border: '1px solid rgba(245,158,11,0.30)',
              }}
            >
              <WifiOff size={16} className="text-amber-400 shrink-0" aria-hidden="true" />
              <div>
                <p className="text-amber-400 text-sm font-medium">Opponent disconnected</p>
                <p className="text-xs" style={{ color: 'rgba(245,158,11,0.6)' }}>
                  {opponentGraceSeconds}s grace period
                </p>
              </div>
            </div>
          )}

          {/* Draw offer */}
          {drawOffered && (
            <div
              className="rounded-xl px-4 py-3"
              role="alertdialog"
              aria-label="Draw offer"
              style={{
                background: 'var(--color-info-faint)',
                border: '1px solid rgba(59,130,246,0.30)',
              }}
            >
              <p className="text-blue-300 text-sm font-medium mb-2 flex items-center gap-2">
                <Handshake size={16} aria-hidden="true" /> Draw Offered
              </p>
              <div className="flex gap-2">
                <button
                  id="draw-accept-btn"
                  onClick={() => sendDrawResponse(true)}
                  className="flex-1 py-1.5 rounded-lg text-sm font-medium transition-all"
                  style={{ background: 'var(--color-primary)', color: '#fff' }}
                >
                  Accept
                </button>
                <button
                  id="draw-decline-btn"
                  onClick={() => sendDrawResponse(false)}
                  className="flex-1 py-1.5 rounded-lg text-sm font-medium transition-all"
                  style={{
                    background: 'var(--color-destructive-faint)',
                    border: '1px solid rgba(239,68,68,0.3)',
                    color: '#fca5a5',
                  }}
                >
                  Decline
                </button>
              </div>
            </div>
          )}

          {/* Move list */}
          <div
            className="rounded-2xl p-4 flex-1 flex flex-col min-h-0 transition-all duration-300"
            style={{
              background: 'var(--color-surface)',
              border: '2px solid rgba(22, 163, 74, 0.3)',
              boxShadow: '0 0 15px rgba(22, 163, 74, 0.1) inset',
            }}
          >
            <div className="flex items-center justify-between mb-3">
              <p
                className="text-xs uppercase tracking-wider font-semibold"
                style={{ color: 'var(--color-muted)' }}
              >
                Moves
              </p>
              {reviewing && (
                <button
                  id="live-mode-btn"
                  onClick={() => selectPly(null)}
                  className="flex items-center gap-1 text-xs transition-colors"
                  style={{ color: 'var(--color-primary-light)' }}
                >
                  <Radio size={12} aria-hidden="true" /> Live
                </button>
              )}
            </div>
            <MoveList />
            {phase === 'review' && (
              <div className="flex justify-between items-center mt-3 pt-3 border-t border-white/10">
                <button
                  onClick={() => selectPly(0)}
                  disabled={selectedPly === 0 || moves.length === 0}
                  className="p-2 bg-white/5 hover:bg-white/10 rounded disabled:opacity-30 transition-colors"
                >
                  <SkipBack size={16} />
                </button>
                <button
                  onClick={() => selectPly(selectedPly === null ? Math.max(0, moves.length - 2) : Math.max(0, selectedPly - 1))}
                  disabled={selectedPly === 0 || moves.length === 0}
                  className="p-2 bg-white/5 hover:bg-white/10 rounded disabled:opacity-30 transition-colors"
                >
                  <ChevronLeft size={16} />
                </button>
                <button
                  onClick={() => selectPly(selectedPly === null || selectedPly >= moves.length - 1 ? null : selectedPly + 1)}
                  disabled={selectedPly === null}
                  className="p-2 bg-white/5 hover:bg-white/10 rounded disabled:opacity-30 transition-colors"
                >
                  <ChevronRight size={16} />
                </button>
                <button
                  onClick={() => selectPly(null)}
                  disabled={selectedPly === null}
                  className="p-2 bg-white/5 hover:bg-white/10 rounded disabled:opacity-30 transition-colors"
                >
                  <SkipForward size={16} />
                </button>
              </div>
            )}
          </div>

          {/* Game controls */}
          {phase === 'playing' && (
            <div className="flex gap-2">
              <button
                id="draw-offer-btn"
                onClick={sendDrawOffer}
                title="Offer Draw"
                className="flex-1 py-3 rounded-xl transition-all flex items-center justify-center gap-2 text-sm"
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid var(--color-border)',
                  color: 'var(--color-muted)',
                }}
                onMouseEnter={e => (e.currentTarget.style.color = 'var(--color-fg)')}
                onMouseLeave={e => (e.currentTarget.style.color = 'var(--color-muted)')}
              >
                <Handshake size={16} aria-hidden="true" /> Draw
              </button>
              <button
                id="resign-btn"
                onClick={sendResign}
                title="Resign"
                className="flex-1 py-3 rounded-xl transition-all flex items-center justify-center gap-2 text-sm"
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid var(--color-border)',
                  color: 'var(--color-muted)',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.background = 'var(--color-destructive-faint)';
                  e.currentTarget.style.borderColor = 'rgba(239,68,68,0.40)';
                  e.currentTarget.style.color = '#fca5a5';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.04)';
                  e.currentTarget.style.borderColor = 'var(--color-border)';
                  e.currentTarget.style.color = 'var(--color-muted)';
                }}
              >
                <Flag size={16} aria-hidden="true" /> Resign
              </button>
            </div>
          )}
          {(phase === 'over' || phase === 'review') && (
            <button
              id="lobby-return-btn"
              onClick={onLeave}
              className="w-full py-3 rounded-xl font-bold transition-all flex items-center justify-center gap-2 mt-2 text-white bg-[#16A34A] hover:bg-[#15803D] shadow-[0_4px_14px_0_rgba(22,163,74,0.39)] hover:shadow-[0_6px_20px_rgba(22,163,74,0.23)] hover:-translate-y-[2px]"
            >
              <Home size={20} aria-hidden="true" /> Back to Lobby
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Player Bar ───────────────────────────────────────────────────────────────

interface PlayerBarProps {
  name: string;
  elo: number;
  time: number;
  isActive: boolean;
  boardWidth: number;
}

function PlayerBar({ name, elo, time, isActive, boardWidth }: PlayerBarProps) {
  return (
    <div
      className="flex items-center justify-between px-4 py-2.5 rounded-xl transition-all"
      style={{
        width: boardWidth,
        background: isActive ? 'var(--color-primary-faint)' : 'var(--color-surface)',
        border: `1px solid ${isActive ? 'rgba(21,128,61,0.40)' : 'var(--color-border)'}`,
        boxShadow: isActive ? 'var(--shadow-glow)' : 'none',
        transition: 'all var(--transition-md)',
      }}
    >
      <div className="flex items-center gap-3">
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold"
          style={{
            background: isActive ? 'var(--color-primary-faint)' : 'rgba(255,255,255,0.06)',
            color: isActive ? 'var(--color-primary-light)' : 'var(--color-muted)',
          }}
          aria-hidden="true"
        >
          {name[0]?.toUpperCase()}
        </div>
        <div>
          <p className="font-medium text-sm">{name}</p>
          <p className="text-xs" style={{ color: 'var(--color-muted)' }}>{elo} ELO</p>
        </div>
      </div>
      {time > 0 && <Clock seconds={time} isActive={isActive} />}
    </div>
  );
}
