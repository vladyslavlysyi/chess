import React from 'react';

interface EvalBarProps {
  evaluation: number | null; // in centipawns
  turn: 'white' | 'black'; // Whose turn it is (determines perspective)
  boardHeight: number;
}

export function EvalBar({ evaluation, turn, boardHeight }: EvalBarProps) {
  // If evaluation is null, assume 0
  const evalCp = evaluation ?? 0;
  
  // Calculate percentage of white's advantage
  // Typical eval formula: 50 + 50 * (eval / 1000)
  // Let's cap it at +/- 1000 cp (+/- 10 pawns)
  const cappedEval = Math.max(-1000, Math.min(1000, evalCp));
  
  // 50% is equal. 1000cp means 100% white. -1000cp means 0% white (100% black).
  let whitePercent = 50 + (cappedEval / 1000) * 50;

  // Render text (e.g. +1.5, -2.0, M3)
  let evalText = (Math.abs(evalCp) / 100).toFixed(1);
  if (Math.abs(evalCp) >= 9000) {
    const movesToMate = Math.ceil((10000 - Math.abs(evalCp)) / 2);
    evalText = `M${movesToMate}`;
    if (evalCp > 0) whitePercent = 100;
    else whitePercent = 0;
  } else {
    if (evalCp > 0) evalText = `+${evalText}`;
    else if (evalCp < 0) evalText = `-${evalText}`;
    else evalText = '0.0';
  }

  // The text is always displayed on the side that has the advantage
  const isWhiteAdvantage = evalCp >= 0;

  return (
    <div 
      className="w-6 rounded-md overflow-hidden bg-[#2C2C2C] flex flex-col relative shadow-inner border border-white/5 ml-4"
      style={{ height: boardHeight }}
    >
      {/* Black section (top) */}
      <div 
        className="w-full transition-all duration-500 ease-in-out bg-[#404040]"
        style={{ height: `${100 - whitePercent}%` }}
      />
      {/* White section (bottom) */}
      <div 
        className="w-full transition-all duration-500 ease-in-out bg-[#E5E5E5]"
        style={{ height: `${whitePercent}%` }}
      />
      
      {/* Eval Text */}
      <div 
        className={`absolute w-full text-center text-[10px] font-bold p-1 z-10 transition-colors ${
          isWhiteAdvantage ? 'bottom-0 text-slate-800' : 'top-0 text-slate-200'
        }`}
      >
        {evalText}
      </div>
    </div>
  );
}
