import React from 'react';
import { useGameStore } from '../../store/gameStore';
import { useAuthStore } from '../../store/authStore';
import { Chessboard } from 'react-chessboard';
import { Chess } from 'chess.js';
import { Flag, Handshake, Home, WifiOff } from 'lucide-react';
import { Clock } from './Clock';
import { MoveList } from './MoveList';

interface GameBoardProps {
  onLeave: () => void;
}

const RESULT_LABELS: Record<string, string> = {
  white: '⬜ White Wins',
  black: '⬛ Black Wins',
  draw: '🤝 Draw',
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
    game, fen, myColor, opponentName, opponentElo, whiteTime, blackTime,
    turn, phase, result, reason, drawOffered, opponentDisconnected,
    opponentGraceSeconds, myDisplayName, lastMoveUci, isCheck,
    whiteEloDelta, blackEloDelta,
    sendMove, sendResign, sendDrawOffer, sendDrawResponse,
  } = useGameStore();
  const { user } = useAuthStore();

  // Compute highlighted squares from last move
  const lastMoveHighlight = React.useMemo(() => {
    if (!lastMoveUci || lastMoveUci.length < 4) return {};
    const from = lastMoveUci.slice(0, 2);
    const to = lastMoveUci.slice(2, 4);
    return {
      [from]: { backgroundColor: 'rgba(255, 255, 100, 0.3)' },
      [to]:   { backgroundColor: 'rgba(255, 255, 100, 0.4)' },
    };
  }, [lastMoveUci]);

  function onPieceDrop(source: string, target: string, piece: string) {
    if (phase !== 'playing') return false;
    const myTurn = (turn === 'white' && myColor === 'white') || (turn === 'black' && myColor === 'black');
    if (!myTurn) return false;

    // Try the move locally to validate
    const testGame = new Chess(fen);
    const move = testGame.move({ from: source, to: target, promotion: 'q' });
    if (!move) return false;

    sendMove(move.from + move.to + (move.promotion || ''));
    return true;
  }

  const myElo = myColor === 'white'
    ? (user?.elo_rapid ?? 1200)
    : (user?.elo_rapid ?? 1200);

  const myDelta = myColor === 'white' ? whiteEloDelta : blackEloDelta;
  const theirDelta = myColor === 'white' ? blackEloDelta : whiteEloDelta;

  return (
    <div className="min-h-screen bg-[#1a1a2e] text-slate-100 flex items-center justify-center p-4">
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-600/5 rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-purple-600/5 rounded-full blur-3xl" />
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
          <div className="relative rounded-2xl overflow-hidden shadow-2xl border-4 border-white/5"
               style={{ width: 'min(580px, calc(100vw - 2rem))' }}>
            <Chessboard
              position={fen}
              onPieceDrop={onPieceDrop}
              boardOrientation={myColor === 'black' ? 'black' : 'white'}
              customSquareStyles={lastMoveHighlight}
              animationDuration={150}
              customDarkSquareStyle={{ backgroundColor: '#769656' }}
              customLightSquareStyle={{ backgroundColor: '#eeeed2' }}
              boardWidth={undefined}
            />
            {/* Game over overlay */}
            {phase === 'over' && (
              <div className="absolute inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center">
                <div className="bg-[#16213e] border border-white/10 rounded-2xl p-8 text-center shadow-2xl mx-4">
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
                    className="mt-6 bg-indigo-600 hover:bg-indigo-500 px-6 py-3 rounded-xl font-medium transition-all flex items-center gap-2 mx-auto"
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
              <p className="text-blue-300 text-sm font-medium mb-2">⚖️ Draw Offered</p>
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
          <div className="bg-[#16213e]/60 border border-white/5 rounded-2xl p-4 flex-1">
            <p className="text-xs text-slate-400 uppercase tracking-wider mb-3">Moves</p>
            <MoveList game={game} />
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
              className="w-full bg-indigo-600 hover:bg-indigo-500 py-3 rounded-xl font-medium transition-all flex items-center justify-center gap-2"
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
        ? 'bg-indigo-600/10 border-indigo-500/40'
        : 'bg-[#16213e]/40 border-white/5'
    }`} style={{ width: 'min(580px, calc(100vw - 2rem))' }}>
      <div className="flex items-center gap-3">
        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
          isActive ? 'bg-indigo-500/20 text-indigo-300' : 'bg-white/5 text-slate-400'
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
