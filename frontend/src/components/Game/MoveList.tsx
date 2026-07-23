import { useRef, useEffect } from 'react';
import { useGameStore } from '../../store/gameStore';
import { EvalGraph } from './EvalGraph';
import type { MoveClassification } from '../../lib/analyzer';

const CLASS_COLORS: Record<MoveClassification, string> = {
  best: 'text-blue-400',
  excellent: 'text-green-400',
  good: 'text-teal-400',
  book: 'text-purple-400',
  inaccuracy: 'text-yellow-400',
  mistake: 'text-orange-400',
  blunder: 'text-red-500',
};

const CLASS_SYMBOLS: Record<MoveClassification, string> = {
  best: '★',
  excellent: '!',
  good: '',
  book: '📖',
  inaccuracy: '?!',
  mistake: '?',
  blunder: '??',
};

export function MoveList() {
  const moves = useGameStore((s) => s.moves);
  const selectedPly = useGameStore((s) => s.selectedPly);
  const selectPly = useGameStore((s) => s.selectPly);
  const analysis = useGameStore((s) => s.analysis);
  const analysisProgress = useGameStore((s) => s.analysisProgress);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (selectedPly === null && ref.current) {
      ref.current.scrollTop = ref.current.scrollHeight;
    }
  }, [moves.length, selectedPly]);

  if (moves.length === 0) {
    return <p className="text-slate-500 text-sm text-center py-4">No moves yet…</p>;
  }

  const activePly = selectedPly === null ? moves.length - 1 : selectedPly;

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
    
    // plies[0] is initial position, so move ply corresponds to plies[ply + 1]
    const plyAnalysis = analysis?.plies?.[m.ply + 1];
    const classification = plyAnalysis?.classification as MoveClassification | undefined;
    
    return (
      <button
        onClick={() => selectPly(m.ply === moves.length - 1 ? null : m.ply)}
        className={`flex-1 text-left px-2 py-1 rounded cursor-pointer transition-all flex justify-between items-center ${
          isActive 
            ? 'bg-[#16A34A] text-white font-bold shadow-[0_0_12px_rgba(22,163,74,0.5)] border border-[#22C55E]/50' 
            : 'text-slate-300 hover:bg-white/10 hover:text-white'
        }`}
      >
        <span>{m.san}</span>
        {classification && CLASS_SYMBOLS[classification] && (
          <span className={`text-xs font-bold ${!isActive ? CLASS_COLORS[classification] : 'text-white'}`}>
            {CLASS_SYMBOLS[classification]}
          </span>
        )}
      </button>
    );
  };

  return (
    <div className="flex flex-col h-full max-h-72">
      {analysisProgress > 0 && analysisProgress < 100 && (
        <div className="w-full bg-[#1A1F36] rounded-full h-1.5 mb-2 overflow-hidden">
          <div className="bg-blue-500 h-1.5 rounded-full transition-all duration-300" style={{ width: `${analysisProgress}%` }}></div>
        </div>
      )}
      
      {analysis && (
        <div className="flex justify-between items-center mb-2 px-1 text-xs font-bold text-slate-300">
          <span className="text-slate-100 bg-white/10 px-2 py-1 rounded">White: {analysis.whiteAccuracy}%</span>
          <span className="text-slate-100 bg-black/40 px-2 py-1 rounded">Black: {analysis.blackAccuracy}%</span>
        </div>
      )}
      
      {analysis && <EvalGraph analysis={analysis} height={40} />}

      <div ref={ref} className="overflow-y-auto space-y-0.5 scrollbar-thin pr-1 flex-1">
        {rows.map((row) => (
          <div key={row.no} className="flex items-center gap-2 text-sm">
            <span className="text-slate-500 w-7 text-right select-none">{row.no}.</span>
            {cell(row.white)}
            {cell(row.black)}
          </div>
        ))}
      </div>
    </div>
  );
}
