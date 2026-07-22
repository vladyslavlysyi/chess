import React, { useEffect, useState } from 'react';
import { useAuthStore } from '../../store/authStore';
import { useGameStore } from '../../store/gameStore';
import { gamesApi } from '../../api/client';
import { Trophy, TrendingUp, TrendingDown, Minus, ArrowLeft, Eye } from 'lucide-react';
import type { GameSummary } from '../../types';

interface ProfilePageProps {
  onBack: () => void;
  onReviewRequested: () => void;
}

export function ProfilePage({ onBack, onReviewRequested }: ProfilePageProps) {
  const { user } = useAuthStore();
  const { loadReplay } = useGameStore();
  const [games, setGames] = useState<GameSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const handleReviewGame = async (gameId: string, myColor: 'white' | 'black') => {
    try {
      const { data } = await gamesApi.detail(gameId);
      loadReplay(data, myColor);
      onReviewRequested();
    } catch (err) {
      console.error('Failed to load game replay:', err);
      alert('Could not load game replay.');
    }
  };

  useEffect(() => {
    gamesApi.history(20, 0)
      .then(({ data }) => {
        setGames(data.games);
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : 'Failed to load game history';
        setError(msg);
      })
      .finally(() => setLoading(false));
  }, []);

  if (!user) return null;

  const total = user.wins + user.losses + user.draws;
  const winRate = total > 0 ? Math.round((user.wins / total) * 100) : 0;

  return (
    <div className="min-h-screen text-slate-100 p-4" style={{ background: 'var(--color-bg)' }}>
      <div className="max-w-2xl mx-auto">
        <button onClick={onBack} className="flex items-center gap-2 text-slate-400 hover:text-white mb-6 transition-colors">
          <ArrowLeft size={18} /> Back
        </button>

        {/* Profile Card */}
        <div className="border border-white/10 rounded-3xl p-6 mb-4" style={{ background: 'var(--color-surface)' }}>
          <div className="flex items-center gap-4 mb-6">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-2xl font-bold"
                 style={{ background: 'var(--color-primary-faint)', color: 'var(--color-primary-light)' }}>
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
              <p className="text-xs text-slate-400 mb-1">Rapid</p>
              <p className="text-2xl font-bold text-white">{user.elo_rapid}</p>
            </div>
            <div className="bg-black/20 rounded-2xl p-4 text-center">
              <p className="text-xs text-slate-400 mb-1">Blitz</p>
              <p className="text-2xl font-bold text-white">{user.elo_blitz}</p>
            </div>
            <div className="bg-black/20 rounded-2xl p-4 text-center">
              <p className="text-xs text-slate-400 mb-1">Bullet</p>
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
            <div className="rounded-xl p-3 text-center" style={{ background: 'var(--color-primary-faint)', border: '1px solid rgba(21,128,61,0.25)' }}>
              <p className="text-xs mb-1" style={{ color: 'var(--color-primary-light)' }}>Win%</p>
              <p className="text-xl font-bold" style={{ color: 'var(--color-accent, #22C55E)' }}>{winRate}%</p>
            </div>
          </div>
        </div>

        {/* Game History */}
        <div className="border border-white/10 rounded-3xl p-6" style={{ background: 'var(--color-surface)' }}>
          <h2 className="text-lg font-semibold mb-4">Recent Games</h2>
          {loading ? (
            <p className="text-slate-400 text-center py-8">Loading...</p>
          ) : error ? (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-6 text-center">
              <p className="text-red-400 font-medium text-sm mb-1">Could not load game history</p>
              <p className="text-red-300/60 text-xs">{error}</p>
            </div>
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
                    <p className="text-xs text-slate-500 w-24 text-right hidden sm:block">{new Date(g.created_at).toLocaleDateString()}</p>
                    <button 
                      onClick={() => handleReviewGame(g.id, isWhite ? 'white' : 'black')}
                      className="p-2 ml-2 bg-white/5 hover:bg-white/10 rounded-lg text-slate-400 hover:text-white transition-colors"
                      title="Review Game"
                    >
                      <Eye size={16} />
                    </button>
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
