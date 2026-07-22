import React from 'react';
import { useGameStore } from '../../store/gameStore';
import { useAuthStore } from '../../store/authStore';
import { ChessgroundBoard } from './ChessgroundBoard';
import { Chess } from 'chess.js';
import { Flag, Handshake, Home, WifiOff, Radio } from 'lucide-react';
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

    // Validate locally before sending.
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

  const [boardWidth, setBoardWidth] = React.useState(() => Math.min(580, window.innerWidth - 32));
  React.useEffect(() => {
    const handleResize = () => setBoardWidth(Math.min(580, window.innerWidth - 32));
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4">
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 right-0 w-96 h-96 bg-green-600/5 rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-slate-500/5 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 w-full max-w-5xl flex flex-col lg:flex-row gap-4 items-start">
        {/* Board column */}
        <div className="w-full lg:w-auto flex flex-col items-center gap-3">
          {/* Opponent info */}
          <PlayerBar
            name={opponentName}
            elo={opponentElo}
            time={myColor === 'white' ? blackTime : whiteTime}
            isActive={turn !== myColor && phase === 'playing'}
            isTop
          />

          {/* Chessboard */}
          <div className="relative rounded-2xl overflow-hidden shadow-2xl border-4 border-white/5 aspect-square"
               style={{ width: boardWidth }}>
            <ChessgroundBoard
              fen={shownFen}
              lastMoveUci={shownLastMove}
              onPieceDrop={onPieceDrop}
              boardOrientation={myColor === 'black' ? 'black' : 'white'}
              movableColor={myColor}
              viewOnly={phase !== 'playing' || reviewing}
              check={isCheck && !reviewing}
            />
            {/* Game over overlay */}
            {phase === 'over' && (
              <div className="absolute inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center">
                <div className="bg-slate-900 border border-white/10 rounded-2xl p-8 text-center shadow-2xl mx-4">
                  <div className="text-4xl mb-2 font-bold">
                    {result ? RESULT_LABELS[result] : '—'}
                  </div>
                  <p className="text-slate-400 mb-2">
                    {reason ? REASON_LABELS[reason] : ''}
                  </p>
                  {phase === 'over' && myColor && (
                    <div className={`text-lg font-bold mt-2 ${myDelta >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {myDelta >= 0 ? '+' : ''}{myDelta} ELO
                    </div>
                  )}
                  <button
                    onClick={onLeave}
                    className="mt-6 bg-green-500 hover:bg-green-400 px-6 py-3 rounded-xl font-medium transition-all flex items-center gap-2 mx-auto shadow-lg shadow-green-500/20"
                  >
                    <Home size={18} /> Back to Lobby
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* My info */}
          <PlayerBar
            name={myDisplayName || user?.username || 'You'}
            elo={myElo}
            time={myColor === 'white' ? whiteTime : blackTime}
            isActive={turn === myColor && phase === 'playing'}
            isTop={false}
          />
        </div>

        {/* Side panel */}
        <div className="w-full lg:w-72 flex flex-col gap-3">
          {/* Opponent disconnected warning */}
          {opponentDisconnected && (
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-3 flex items-center gap-2">
              <WifiOff size={16} className="text-amber-400 shrink-0" />
              <div>
                <p className="text-amber-400 text-sm font-medium">Opponent disconnected</p>
                <p className="text-amber-300/60 text-xs">{opponentGraceSeconds}s grace period</p>
              </div>
            </div>
          )}

          {/* Draw offer */}
          {drawOffered && (
            <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl px-4 py-3">
              <p className="text-blue-300 text-sm font-medium mb-2 flex items-center gap-2"><Handshake size={16} /> Draw Offered</p>
              <div className="flex gap-2">
                <button
                  onClick={() => sendDrawResponse(true)}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-500 py-1.5 rounded-lg text-sm font-medium transition-all"
                >
                  Accept
                </button>
                <button
                  onClick={() => sendDrawResponse(false)}
                  className="flex-1 bg-red-600/30 hover:bg-red-600/50 border border-red-500/30 py-1.5 rounded-lg text-sm font-medium transition-all"
                >
                  Decline
                </button>
              </div>
            </div>
          )}

          {/* Move list */}
          <div className="bg-slate-900/60 border border-white/5 rounded-2xl p-4 flex-1">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs text-slate-400 uppercase tracking-wider">Moves</p>
              {reviewing && (
                <button
                  onClick={() => selectPly(null)}
                  className="flex items-center gap-1 text-xs text-emerald-400 hover:text-emerald-300 transition-colors cursor-pointer"
                >
                  <Radio size={12} /> Live
                </button>
              )}
            </div>
            <MoveList />
          </div>

          {/* Controls */}
          {phase === 'playing' && (
            <div className="flex gap-2">
              <button
                onClick={sendDrawOffer}
                title="Offer Draw"
                className="flex-1 bg-black/20 hover:bg-black/40 border border-white/10 hover:border-white/20 py-3 rounded-xl transition-all flex items-center justify-center gap-2 text-slate-400 hover:text-white text-sm"
              >
                <Handshake size={16} /> Draw
              </button>
              <button
                onClick={sendResign}
                title="Resign"
                className="flex-1 bg-black/20 hover:bg-red-900/30 border border-white/10 hover:border-red-500/40 py-3 rounded-xl transition-all flex items-center justify-center gap-2 text-slate-400 hover:text-red-400 text-sm"
              >
                <Flag size={16} /> Resign
              </button>
            </div>
          )}
          {phase === 'over' && (
            <button
              onClick={onLeave}
              className="w-full bg-green-500 hover:bg-green-400 py-3 rounded-xl font-medium transition-all flex items-center justify-center gap-2 shadow-lg shadow-green-500/20"
            >
              <Home size={18} /> Back to Lobby
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
  isTop: boolean;
}

function PlayerBar({ name, elo, time, isActive, isTop }: PlayerBarProps) {
  return (
    <div className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border transition-all ${
      isActive
        ? 'bg-green-500/10 border-green-500/40'
        : 'bg-slate-900/40 border-white/5'
    }`} style={{ width: 'min(580px, calc(100vw - 2rem))' }}>
      <div className="flex items-center gap-3">
        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
          isActive ? 'bg-green-500/20 text-green-300' : 'bg-white/5 text-slate-400'
        }`}>
          {name[0]?.toUpperCase()}
        </div>
        <div>
          <p className="font-medium text-sm">{name}</p>
          <p className="text-xs text-slate-400">{elo} ELO</p>
        </div>
      </div>
      <Clock seconds={time} isActive={isActive} />
    </div>
  );
}
