import React, { useEffect, useRef } from 'react';

interface ClockProps {
  seconds: number;
  isActive: boolean;
}

function fmt(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

export function Clock({ seconds, isActive }: ClockProps) {
  const isLow = seconds < 30;
  const isCritical = seconds < 10;

  return (
    <div className={`font-mono text-2xl font-bold px-4 py-2 rounded-xl transition-all ${
      isCritical && isActive
        ? 'bg-red-500/20 text-red-400 animate-pulse'
        : isLow && isActive
        ? 'bg-amber-500/10 text-amber-400'
        : isActive
        ? 'bg-white/10 text-white'
        : 'bg-black/20 text-slate-400'
    }`}>
      {fmt(seconds)}
    </div>
  );
}
