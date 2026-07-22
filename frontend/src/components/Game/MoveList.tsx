import React, { useRef, useEffect } from 'react';
import { Chess } from 'chess.js';

interface MoveListProps {
  game: Chess;
}

export function MoveList({ game }: MoveListProps) {
  const ref = useRef<HTMLDivElement>(null);
  const history = game.history({ verbose: false });

  // Scroll to bottom on new move
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [history.length]);

  // Group into pairs: [white_move, black_move?]
  const pairs: [string, string?][] = [];
  for (let i = 0; i < history.length; i += 2) {
    pairs.push([history[i], history[i + 1]]);
  }

  if (pairs.length === 0) {
    return <p className="text-slate-500 text-sm text-center py-4">Game in progress...</p>;
  }

  return (
    <div ref={ref} className="max-h-72 overflow-y-auto space-y-0.5 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-white/10">
      {pairs.map(([white, black], idx) => (
        <div
          key={idx}
          className={`flex items-center gap-2 px-2 py-1 rounded-lg text-sm ${
            idx === pairs.length - 1 ? 'bg-indigo-500/10' : 'hover:bg-white/5'
          }`}
        >
          <span className="text-slate-500 w-7 text-right">{idx + 1}.</span>
          <span className="text-slate-200 flex-1">{white}</span>
          <span className="text-slate-200 flex-1">{black ?? ''}</span>
        </div>
      ))}
    </div>
  );
}
