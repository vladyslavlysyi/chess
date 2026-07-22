import React, { useEffect, useState } from 'react';
import { useAuthStore } from '../../store/authStore';
import { gamesApi } from '../../api/client';
import { Trophy, TrendingUp, TrendingDown, Minus, ArrowLeft } from 'lucide-react';
import type { GameSummary } from '../../types';

interface ProfilePageProps {
  onBack: () => void;
}

export function ProfilePage({ onBack }: ProfilePageProps) {
  const { user } = useAuthStore();
  const [games, setGames] = useState<GameSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    gamesApi.history(20, 0).then(({ data }) => {
      setGames(data.games);
    }).finally(() => setLoading(false));
  }, []);

  if (!user) return null;

  const total = user.wins + user.losses + user.draws;
  const winRate = total > 0 ? Math.round((user.wins / total) * 100) : 0;

  return (
    <div className="min-h-screen bg-[#1a1a2e] text-slate-100 p-4">
      <div className="max-w-2xl mx-auto">
        <button onClick={onBack} className="flex items-center gap-2 text-slate-400 hover:text-white mb-6 transition-colors">
          <ArrowLeft size={18} /> Back
        </button>

        {/* Profile Card */}
        <div className="bg-[#16213e]/80 border border-white/10 rounded-3xl p-6 mb-4">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-16 h-16 rounded-2xl bg-indigo-500/20 flex items-center justify-center text-2xl font-bold text-indigo-300">
              {user.username[0]?.toUpperCase()}
            </div>
            <div>
              <h1 className="text-2xl font-bold">{user.username}</h1>
              <p className="text-slate-400 text-sm">{user.email}</p>
              <p className="text-slate-500 text-xs mt-1">Member since {new Date(user.created_at).toLocaleDateString()}</p>
            </div>
          </div>

          {/* ELO ratings */}
          <div className="grid grid-cols-3 gap-3 mb-6">
            <div className="bg-black/20 rounded-2xl p-4 text-center">
              <p className="text-xs text-slate-400 mb-1">⚡ Rapid</p>
              <p className="text-2xl font-bold text-white">{user.elo_rapid}</p>
            </div>
            <div className="bg-black/20 rounded-2xl p-4 text-center">
              <p className="text-xs text-slate-400 mb-1">🔥 Blitz</p>
              <p className="text-2xl font-bold text-white">{user.elo_blitz}</p>
            </div>
            <div className="bg-black/20 rounded-2xl p-4 text-center">
              <p className="text-xs text-slate-400 mb-1">💨 Bullet</p>
              <p className="text-2xl font-bold text-white">{user.elo_bullet}</p>
            </div>
          </div>

          {/* Win/Loss/Draw */}
          <div className="grid grid-cols-4 gap-3">
            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3 text-center">
              <p className="text-xs text-emerald-400 mb-1">Wins</p>
              <p className="text-xl font-bold text-emerald-300">{user.wins}</p>
            </div>
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-center">
              <p className="text-xs text-red-400 mb-1">Losses</p>
              <p className="text-xl font-bold text-red-300">{user.losses}</p>
            </div>
            <div className="bg-slate-500/10 border border-slate-500/20 rounded-xl p-3 text-center">
              <p className="text-xs text-slate-400 mb-1">Draws</p>
              <p className="text-xl font-bold text-slate-300">{user.draws}</p>
            </div>
            <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-xl p-3 text-center">
              <p className="text-xs text-indigo-400 mb-1">Win%</p>
              <p className="text-xl font-bold text-indigo-300">{winRate}%</p>
            </div>
          </div>
        </div>

        {/* Game History */}
        <div className="bg-[#16213e]/80 border border-white/10 rounded-3xl p-6">
          <h2 className="text-lg font-semibold mb-4">Recent Games</h2>
          {loading ? (
            <p className="text-slate-400 text-center py-8">Loading...</p>
          ) : games.length === 0 ? (
            <p className="text-slate-400 text-center py-8">No games played yet</p>
          ) : (
            <div className="space-y-2">
              {games.map((g) => {
                const isWhite = g.white_display_name === user.username;
                const myEloBefore = isWhite ? g.white_elo_before : g.black_elo_before;
                const myEloAfter = isWhite ? g.white_elo_after : g.black_elo_after;
                const delta = myEloAfter != null && myEloBefore != null ? myEloAfter - myEloBefore : null;
                const opponent = isWhite ? g.black_display_name : g.white_display_name;
                const isWin = (isWhite && g.status === 'white_won') || (!isWhite && g.status === 'black_won');
                const isLoss = (isWhite && g.status === 'black_won') || (!isWhite && g.status === 'white_won');

                return (
                  <div key={g.id} className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-all ${
                    isWin ? 'bg-emerald-500/5 border-emerald-500/20' :
                    isLoss ? 'bg-red-500/5 border-red-500/20' :
                    'bg-black/10 border-white/5'
                  }`}>
                    <div className={`w-2 h-8 rounded-full ${isWin ? 'bg-emerald-500' : isLoss ? 'bg-red-500' : 'bg-slate-500'}`} />
                    <div className="flex-1">
                      <p className="font-medium text-sm">vs {opponent}</p>
                      <p className="text-xs text-slate-400">{g.time_control} · {g.is_rated ? 'Rated' : 'Casual'}</p>
                    </div>
                    {delta != null && (
                      <div className={`flex items-center gap-1 text-sm font-bold ${delta >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {delta >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                        {delta >= 0 ? '+' : ''}{delta}
                      </div>
                    )}
                    <p className="text-xs text-slate-500">{new Date(g.created_at).toLocaleDateString()}</p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
