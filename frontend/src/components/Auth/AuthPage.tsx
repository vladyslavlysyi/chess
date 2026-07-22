import React, { useState } from 'react';
import { useAuthStore } from '../../store/authStore';
import { LogIn, UserPlus, Eye, EyeOff, Swords } from 'lucide-react';

interface AuthPageProps {
  onBack: () => void;
  onSuccess?: () => void;
}

export function AuthPage({ onBack, onSuccess }: AuthPageProps) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const { login, register, isLoading, error, clearError } = useAuthStore();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    try {
      if (mode === 'login') {
        await login(username, password);
      } else {
        await register(username, email, password);
      }
      if (onSuccess) onSuccess();
    } catch { /* error shown from store */ }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Card */}
        <div className="bg-slate-900/80 backdrop-blur-xl border border-white/10 rounded-3xl p-8 shadow-2xl">
          <div className="flex items-center gap-3 mb-8">
            <div className="bg-green-500/20 p-3 rounded-xl">
              <Swords className="text-green-400" size={24} />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">NexusChess</h1>
              <p className="text-slate-400 text-sm">
                {mode === 'login' ? 'Welcome back' : 'Create account'}
              </p>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex bg-black/20 rounded-xl p-1 mb-6">
            <button
              onClick={() => setMode('login')}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
                mode === 'login' ? 'bg-green-500 text-white shadow-lg shadow-green-500/20' : 'text-slate-400 hover:text-white'
              }`}
            >
              <LogIn size={14} className="inline mr-1" /> Sign In
            </button>
            <button
              onClick={() => setMode('register')}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
                mode === 'register' ? 'bg-green-500 text-white shadow-lg shadow-green-500/20' : 'text-slate-400 hover:text-white'
              }`}
            >
              <UserPlus size={14} className="inline mr-1" /> Register
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-xs text-slate-400 uppercase tracking-wider mb-1 block">Username</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                minLength={3}
                autoFocus
                className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500 transition-all"
                placeholder="grandmaster99"
              />
            </div>

            {mode === 'register' && (
              <div>
                <label className="text-xs text-slate-400 uppercase tracking-wider mb-1 block">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500 transition-all"
                  placeholder="you@example.com"
                />
              </div>
            )}

            <div>
              <label className="text-xs text-slate-400 uppercase tracking-wider mb-1 block">Password</label>
              <div className="relative">
                <input
                  type={showPass ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                  className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-3 pr-12 text-white placeholder-slate-500 focus:outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500 transition-all"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPass(!showPass)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                >
                  {showPass ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {error && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-green-500 hover:bg-green-400 disabled:opacity-50 py-3 px-6 rounded-xl font-semibold text-white shadow-lg shadow-green-500/20 transition-all duration-200"
            >
              {isLoading ? 'Loading...' : mode === 'login' ? 'Sign In' : 'Create Account'}
            </button>
          </form>

          <button
            onClick={onBack}
            className="mt-6 w-full text-slate-400 hover:text-white text-sm transition-colors"
          >
            ← Back to Menu
          </button>
        </div>
      </div>
    </div>
  );
}
