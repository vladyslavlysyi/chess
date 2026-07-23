import React from 'react';
import type { GameAnalysis } from '../../lib/analyzer';

interface EvalGraphProps {
  analysis: GameAnalysis;
  height?: number;
}

export function EvalGraph({ analysis, height = 60 }: EvalGraphProps) {
  if (!analysis || !analysis.plies || analysis.plies.length === 0) return null;

  const plies = analysis.plies;
  const numPlies = plies.length;
  
  // Create points for the SVG polygon
  // X: 0 to 100% based on ply index
  // Y: Evaluation. Range is roughly -500 to +500 CP. 0 is middle.
  
  const width = 1000;
  const h = height;
  
  // Transform eval to Y coordinate
  const getY = (cp: number) => {
    // Cap at +/- 800 for graph display
    const capped = Math.max(-800, Math.min(800, cp));
    // 800 -> 0 (top), -800 -> h (bottom), 0 -> h/2 (middle)
    const normalized = (capped + 800) / 1600; // 0 to 1
    return h - (normalized * h);
  };

  const getX = (i: number) => {
    return (i / Math.max(1, numPlies - 1)) * width;
  };

  let points = `0,${h} `; // Start at bottom left to fill under the curve
  
  for (let i = 0; i < numPlies; i++) {
    points += `${getX(i)},${getY(plies[i].evaluation)} `;
  }
  
  points += `${width},${h}`; // End at bottom right

  return (
    <div className="w-full relative mt-2 mb-2 rounded-lg overflow-hidden bg-[#2C2C2C]" style={{ height }}>
      <svg 
        viewBox={`0 0 ${width} ${h}`} 
        preserveAspectRatio="none" 
        className="w-full h-full absolute inset-0"
      >
        {/* Middle zero-line */}
        <line x1="0" y1={h / 2} x2={width} y2={h / 2} stroke="rgba(255,255,255,0.1)" strokeWidth="1" />
        
        {/* Fill area under the curve */}
        <polygon 
          points={points} 
          fill="rgba(255, 255, 255, 0.8)" 
        />
        
        {/* The line itself */}
        <polyline 
          points={points.replace(`0,${h} `, '').replace(` ${width},${h}`, '')} 
          fill="none" 
          stroke="#fff" 
          strokeWidth="2" 
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </div>
  );
}
