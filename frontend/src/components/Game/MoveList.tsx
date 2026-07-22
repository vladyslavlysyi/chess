import { useRef, useEffect } from 'react';
import { useGameStore } from '../../store/gameStore';

/**
 * Interactive move list. Each half-move is clickable to review that position;
 * clicking the live (last) move returns to following the game.
 */
export function MoveList() {
  const moves = useGameStore((s) => s.moves);
  const selectedPly = useGameStore((s) => s.selectedPly);
  const selectPly = useGameStore((s) => s.selectPly);
  const ref = useRef<HTMLDivElement>(null);

  // Auto-scroll to the newest move while following live.
  useEffect(() => {
    if (selectedPly === null && ref.current) {
      ref.current.scrollTop = ref.current.scrollHeight;
    }
  }, [moves.length, selectedPly]);

  if (moves.length === 0) {
    return <p className="text-slate-500 text-sm text-center py-4">No moves yet…</p>;
  }

  // The ply currently shown on the board (null = last move).
  const activePly = selectedPly === null ? moves.length - 1 : selectedPly;

  // Group half-moves into full-move rows: [white, black?].
  const rows: { no: number; white?: { san: string; ply: number }; black?: { san: string; ply: number } }[] = [];
  for (let i = 0; i < moves.length; i += 2) {
    rows.push({
      no: i / 2 + 1,
      white: { san: moves[i].san, ply: i },
      black: moves[i + 1] ? { san: moves[i + 1].san, ply: i + 1 } : undefined,
    });
  }

  const cell = (m?: { san: string; ply: number }) => {
    if (!m) return <span className="flex-1" />;
    const isActive = m.ply === activePly;
    return (
      <button
        onClick={() => selectPly(m.ply === moves.length - 1 ? null : m.ply)}
        className={`flex-1 text-left px-2 py-1 rounded cursor-pointer transition-all ${
          isActive 
            ? 'bg-[#16A34A] text-white font-bold shadow-[0_0_12px_rgba(22,163,74,0.5)] border border-[#22C55E]/50' 
            : 'text-slate-300 hover:bg-white/10 hover:text-white'
        }`}
      >
        {m.san}
      </button>
    );
  };

  return (
    <div ref={ref} className="max-h-72 overflow-y-auto space-y-0.5 scrollbar-thin pr-1">
      {rows.map((row) => (
        <div key={row.no} className="flex items-center gap-2 text-sm">
          <span className="text-slate-500 w-7 text-right select-none">{row.no}.</span>
          {cell(row.white)}
          {cell(row.black)}
        </div>
      ))}
    </div>
  );
}
