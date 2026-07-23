import React, { useState, useEffect } from 'react';
import { ArrowLeft, Trophy, Zap, Timer, Clock } from 'lucide-react';
import { authApi } from '../../api/client';
import type { User } from '../../types';

interface LeaderboardProps {
  onBack: () => void;
}

export function Leaderboard({ onBack }: LeaderboardProps) {
  const [mode, setMode] = useState<'bullet' | 'blitz' | 'rapid'>('rapid');
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    authApi.leaderboard(mode)
      .then(res => {
        setUsers(res.data);
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to load leaderboard', err);
        setLoading(false);
      });
  }, [mode]);

  const getElo = (user: User) => {
    if (mode === 'bullet') return user.elo_bullet;
    if (mode === 'blitz') return user.elo_blitz;
    return user.elo_rapid;
  };

  const ModeIcon = mode === 'bullet' ? Zap : mode === 'blitz' ? Timer : Clock;

  return (
    <div className="min-h-screen bg-[#020617] text-slate-100 flex flex-col items-center py-12 px-4 relative overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
        <div className="absolute top-0 right-1/4 w-[400px] h-[400px] bg-amber-600/10 rounded-full blur-[100px]" />
        <div className="absolute -bottom-20 -left-20 w-[500px] h-[500px] bg-blue-600/10 rounded-full blur-[100px]" />
      </div>

      <div className="w-full max-w-3xl z-10 relative">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors mb-8"
        >
          <ArrowLeft size={20} /> Back to Lobby
        </button>

        <div className="bg-[#0E1223]/80 backdrop-blur-xl border border-white/5 rounded-2xl p-6 shadow-2xl">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
              <div className="bg-amber-500/20 p-3 rounded-xl">
                <Trophy className="text-amber-400" size={28} />
              </div>
              <h1 className="text-3xl font-bold tracking-tight text-white">Global Leaderboard</h1>
            </div>

            <div className="flex bg-[#1A1E2F] rounded-xl p-1 shadow-inner border border-white/5">
              {(['bullet', 'blitz', 'rapid'] as const).map(m => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={`px-4 py-2 rounded-lg font-medium text-sm transition-all flex items-center gap-2 ${
                    mode === m
                      ? 'bg-[#272F42] text-white shadow-sm border border-white/10'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {m === 'bullet' && <Zap size={14} />}
                  {m === 'blitz' && <Timer size={14} />}
                  {m === 'rapid' && <Clock size={14} />}
                  <span className="capitalize">{m}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-white/5 text-slate-400 text-sm">
                  <th className="pb-4 font-medium pl-4">Rank</th>
                  <th className="pb-4 font-medium">Player</th>
                  <th className="pb-4 font-medium text-right pr-4">Rating</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {loading ? (
                  <tr>
                    <td colSpan={3} className="py-12 text-center text-slate-500">
                      <div className="animate-pulse flex flex-col items-center gap-3">
                        <Trophy size={32} className="text-slate-700" />
                        <span>Loading rankings...</span>
                      </div>
                    </td>
                  </tr>
                ) : users.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="py-12 text-center text-slate-500">
                      No ranked players found in this mode yet.
                    </td>
                  </tr>
                ) : (
                  users.map((u, i) => (
                    <tr key={u.id} className="group hover:bg-white/[0.02] transition-colors">
                      <td className="py-4 pl-4 text-slate-500 font-mono w-24">
                        {i === 0 ? (
                          <span className="text-amber-400 text-lg font-bold">#1</span>
                        ) : i === 1 ? (
                          <span className="text-slate-300 text-lg font-bold">#2</span>
                        ) : i === 2 ? (
                          <span className="text-amber-700 text-lg font-bold">#3</span>
                        ) : (
                          `#${i + 1}`
                        )}
                      </td>
                      <td className="py-4">
                        <span className="font-bold text-slate-200 group-hover:text-white transition-colors text-lg tracking-tight">
                          {u.username}
                        </span>
                      </td>
                      <td className="py-4 text-right pr-4">
                        <div className="inline-flex items-center gap-2 bg-[#272F42] px-3 py-1 rounded-lg border border-white/5 shadow-sm">
                          <ModeIcon size={14} className="text-amber-400" />
                          <span className="font-bold text-white">{getElo(u)}</span>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
