import React from 'react';
import { useGameStore } from '../../store/gameStore';
import { useAuthStore } from '../../store/authStore';
import { useLobbySocket } from '../../hooks/useSocket';
import { Swords, User, LogIn, Bot, Trophy, Zap, Timer, Clock, Users, Copy, Check } from 'lucide-react';
import type { TimeControl } from '../../types';

interface LobbyProps {
  onAuthRequest: () => void;
  onProfileRequest: () => void;
}

const TIME_CONTROLS: { label: string; value: TimeControl; type: string; icon: React.ReactNode }[] = [
  { label: '1+0', value: '1+0', type: 'Bullet', icon: <Zap size={14} /> },
  { label: '2+1', value: '2+1', type: 'Bullet', icon: <Zap size={14} /> },
  { label: '3+0', value: '3+0', type: 'Blitz', icon: <Timer size={14} /> },
  { label: '3+2', value: '3+2', type: 'Blitz', icon: <Timer size={14} /> },
  { label: '5+0', value: '5+0', type: 'Blitz', icon: <Timer size={14} /> },
  { label: '5+3', value: '5+3', type: 'Blitz', icon: <Timer size={14} /> },
  { label: '10+0', value: '10+0', type: 'Rapid', icon: <Clock size={14} /> },
  { label: '10+5', value: '10+5', type: 'Rapid', icon: <Clock size={14} /> },
  { label: '15+10', value: '15+10', type: 'Rapid', icon: <Clock size={14} /> },
];

const BOT_LEVELS = [
  { label: 'Beginner', elo: 600, color: 'text-green-400', bg: 'border-green-500/30 hover:border-green-400/50' },
  { label: 'Easy', elo: 900, color: 'text-lime-400', bg: 'border-lime-500/30 hover:border-lime-400/50' },
  { label: 'Medium', elo: 1200, color: 'text-yellow-400', bg: 'border-yellow-500/30 hover:border-yellow-400/50' },
  { label: 'Hard', elo: 1600, color: 'text-orange-400', bg: 'border-orange-500/30 hover:border-orange-400/50' },
  { label: 'Expert', elo: 2000, color: 'text-red-400', bg: 'border-red-500/30 hover:border-red-400/50' },
  { label: 'Master', elo: 2500, color: 'text-purple-400', bg: 'border-purple-500/30 hover:border-purple-400/50' },
];

export function Lobby({ onAuthRequest, onProfileRequest }: LobbyProps) {
  const [tab, setTab] = React.useState<'play' | 'bot' | 'friend'>('play');
  const [selectedTc, setSelectedTc] = React.useState<TimeControl>('10+0');
  const [isRated, setIsRated] = React.useState(false);
  const [copiedLink, setCopiedLink] = React.useState(false);
  const { user, isAuthenticated, logout } = useAuthStore();
  const { phase, lobbySocket, privateRoomCode } = useGameStore();
  const { connect } = useLobbySocket();

  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const room = params.get('room');
    if (room) {
      window.history.replaceState({}, document.title, '/');
      const token = localStorage.getItem('access_token') || undefined;
      const ws = connect(token);
      ws.onopen = () => {
        ws.send(JSON.stringify({ type: 'join_private', room_code: room }));
      };
    }
  }, [connect]);

  const handleFindMatch = () => {
    if (isRated && !isAuthenticated) {
      onAuthRequest();
      return;
    }
    const token = localStorage.getItem('access_token') || undefined;
    const ws = connect(token);
    ws.onopen = () => {
      ws.send(JSON.stringify({
        type: 'find_match',
        time_control: selectedTc,
        mode: isRated ? 'rated' : 'casual',
      }));
    };
  };

  const handleBotGame = (elo: number) => {
    const token = localStorage.getItem('access_token') || undefined;
    const ws = connect(token);
    ws.onopen = () => {
      ws.send(JSON.stringify({
        type: 'play_bot',
        time_control: selectedTc,
        target_elo: elo,
      }));
    };
  };

  const handleCreatePrivate = () => {
    const token = localStorage.getItem('access_token') || undefined;
    const ws = connect(token);
    ws.onopen = () => {
      ws.send(JSON.stringify({
        type: 'create_private',
        time_control: selectedTc,
      }));
    };
  };

  const copyRoomLink = () => {
    const url = `${window.location.origin}/?room=${privateRoomCode}`;
    navigator.clipboard.writeText(url);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleCancel = () => {
    lobbySocket?.send(JSON.stringify({ type: 'cancel' }));
    useGameStore.getState().reset();
  };

  return (
    <div className="min-h-screen bg-[#020617] text-slate-100 flex flex-col relative overflow-hidden">
      {/* Premium ambient background */}
      <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
        <div className="absolute -top-40 -right-40 w-[600px] h-[600px] bg-violet-600/10 rounded-full blur-[120px]" />
        <div className="absolute top-40 -left-40 w-[500px] h-[500px] bg-blue-600/10 rounded-full blur-[100px]" />
        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 mix-blend-overlay"></div>
      </div>

      {/* Header */}
      <header className="p-6 border-b border-white/5 flex justify-between items-center bg-[#0E1223]/80 backdrop-blur-xl relative z-10">
        <div className="flex items-center gap-3">
          <div className="bg-green-500/20 p-2 rounded-xl">
            <Swords className="text-green-400" size={24} />
          </div>
          <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400 tracking-tight">
            NexusChess
          </h1>
        </div>
        <div className="flex items-center gap-3">
          {isAuthenticated && user ? (
            <div className="flex items-center gap-5">
              <button
                onClick={onProfileRequest}
                className="flex flex-col items-end hover:opacity-80 transition-opacity"
                title="View profile"
              >
                <p className="text-base font-bold text-slate-100 leading-tight">{user.username}</p>
                <p className="text-xs text-slate-400 font-medium flex items-center gap-1 mt-0.5">
                  <Zap size={12} className="text-amber-400 fill-amber-400" />
                  {user.elo_rapid} Rapid
                </p>
              </button>
              <div className="w-px h-8 bg-slate-700/50 hidden sm:block"></div>
              <button
                onClick={logout}
                className="text-sm font-medium text-slate-300 hover:text-white bg-slate-800/50 hover:bg-slate-700/50 border border-slate-700/50 hover:border-slate-600 px-4 py-2 rounded-xl transition-all shadow-sm"
              >
                Sign out
              </button>
            </div>
          ) : (
            <button
              onClick={onAuthRequest}
              className="flex items-center gap-2 bg-[#16A34A] hover:bg-[#15803D] text-white px-5 py-2.5 rounded-xl text-sm font-bold transition-all shadow-[0_4px_14px_0_rgba(22,163,74,0.39)] hover:shadow-[0_6px_20px_rgba(22,163,74,0.23)] hover:-translate-y-0.5"
            >
              <LogIn size={16} /> Sign In
            </button>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex items-center justify-center p-4">
        {phase === 'queued' ? (
          <QueueScreen onCancel={handleCancel} />
        ) : (
          <div className="w-full max-w-md bg-slate-900/80 backdrop-blur-xl border border-white/10 rounded-3xl p-6 shadow-2xl">
            {/* Tabs */}
            <div className="flex bg-black/20 rounded-2xl p-1 mb-8">
              <button
                onClick={() => setTab('play')}
                className={`flex-1 py-3 rounded-xl font-medium transition-all flex justify-center items-center gap-2 ${
                  tab === 'play' ? 'bg-slate-800 text-white shadow-lg' : 'text-slate-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <User size={18} /> Play Player
              </button>
              <button
                onClick={() => setTab('friend')}
                className={`flex-1 py-3 rounded-xl font-medium transition-all flex justify-center items-center gap-2 ${
                  tab === 'friend' ? 'bg-slate-800 text-white shadow-lg' : 'text-slate-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <Users size={18} /> Play Friend
              </button>
              <button
                onClick={() => setTab('bot')}
                className={`flex-1 py-3 rounded-xl font-medium transition-all flex justify-center items-center gap-2 ${
                  tab === 'bot' ? 'bg-slate-800 text-white shadow-lg' : 'text-slate-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <Bot size={18} /> Play Bot
              </button>
            </div>

            {/* Time Control Picker */}
            <div className="mb-8">
              <p className="text-xs text-slate-400 uppercase tracking-wider mb-3">Time Control</p>
              <div className="grid grid-cols-3 gap-2">
                {TIME_CONTROLS.map((tc) => (
                  <button
                    key={tc.value}
                    onClick={() => setSelectedTc(tc.value)}
                    className={`py-3 px-4 rounded-xl border text-sm font-medium transition-all flex items-center justify-center gap-2 ${
                      selectedTc === tc.value
                        ? 'bg-green-500/20 border-green-500 text-white'
                        : 'bg-black/20 border-white/10 text-slate-400 hover:border-white/30 hover:text-white'
                    }`}
                  >
                    {tc.icon}
                    <span>{tc.label}</span>
                    <span className={`text-xs ${selectedTc === tc.value ? 'text-green-300' : 'text-slate-500'}`}>
                      {tc.type}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {tab === 'play' ? (
              <div className="space-y-3">
                {/* Rated toggle */}
                <div className="flex items-center justify-between bg-black/20 border border-white/5 rounded-2xl px-5 py-4">
                  <div className="flex items-center gap-2">
                    <Trophy size={18} className="text-yellow-400" />
                    <div>
                      <p className="font-medium text-sm">Rated Game</p>
                      <p className="text-xs text-slate-400">Affects your ELO rating</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setIsRated(!isRated)}
                    className={`w-12 h-6 rounded-full transition-colors relative ${isRated ? 'bg-green-500' : 'bg-slate-700'}`}
                  >
                    <span className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${isRated ? 'left-7' : 'left-1'}`} />
                  </button>
                </div>

                <button
                  onClick={handleFindMatch}
                  className="w-full bg-green-500 hover:bg-green-400 py-4 rounded-2xl font-semibold text-lg shadow-xl shadow-green-500/20 transition-all duration-200 flex items-center justify-center gap-3"
                >
                  <Swords size={20} />
                  Find Opponent
                </button>

                {!isAuthenticated && (
                  <button
                    onClick={handleFindMatch}
                    className="w-full bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 py-4 rounded-2xl font-medium transition-all flex items-center justify-center gap-2 text-slate-300"
                  >
                    <User size={18} /> Play as Guest
                  </button>
                )}
              </div>
            ) : tab === 'friend' ? (
              privateRoomCode ? (
                <div className="text-center space-y-4 py-4">
                  <div className="mx-auto w-16 h-16 bg-blue-500/20 text-blue-400 rounded-full flex items-center justify-center mb-2 animate-pulse">
                    <Users size={32} />
                  </div>
                  <h3 className="text-xl font-bold">Room Created!</h3>
                  <p className="text-slate-400 text-sm">Send this link to your friend. The game will start automatically when they join.</p>
                  
                  <div className="bg-black/40 border border-white/10 rounded-xl p-3 mt-4 flex items-center gap-3">
                    <code className="text-sm text-green-300 flex-1 truncate text-left">
                      {window.location.origin}/?room={privateRoomCode}
                    </code>
                    <button
                      onClick={copyRoomLink}
                      className="p-2 bg-white/10 hover:bg-white/20 rounded-lg transition-colors text-white"
                      title="Copy Link"
                    >
                      {copiedLink ? <Check size={16} className="text-green-400" /> : <Copy size={16} />}
                    </button>
                  </div>
                  <button
                    onClick={handleCancel}
                    className="w-full mt-2 border border-white/10 hover:border-red-500/50 text-slate-400 hover:text-red-400 py-3 rounded-xl transition-all font-medium"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  <p className="text-sm text-slate-400 text-center mb-4">
                    Create a private room and invite a friend via a link. Unrated games only.
                  </p>
                  <button
                    onClick={handleCreatePrivate}
                    className="w-full bg-blue-600 hover:bg-blue-500 py-4 rounded-2xl font-semibold text-lg shadow-xl shadow-blue-600/20 transition-all duration-200 flex items-center justify-center gap-3"
                  >
                    <Users size={20} />
                    Create Room
                  </button>
                </div>
              )
            ) : (
              <div>
                <p className="text-xs text-slate-400 uppercase tracking-wider mb-3">Bot Difficulty</p>
                <div className="grid grid-cols-2 gap-3">
                  {BOT_LEVELS.map((bot) => (
                    <button
                      key={bot.elo}
                      onClick={() => handleBotGame(bot.elo)}
                      className={`bg-black/20 border ${bot.bg} py-4 px-5 rounded-2xl text-left transition-all group`}
                    >
                      <p className={`font-semibold ${bot.color}`}>{bot.label}</p>
                      <p className="text-slate-400 text-sm">~{bot.elo} ELO</p>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

function QueueScreen({ onCancel }: { onCancel: () => void }) {
  const { queuePosition } = useGameStore();

  return (
    <div className="text-center space-y-6">
      <div className="relative w-24 h-24 mx-auto">
        <div className="absolute inset-0 rounded-full border-4 border-green-500/20 animate-ping" />
        <div className="absolute inset-2 rounded-full border-4 border-green-500/40 animate-pulse" />
        <div className="absolute inset-0 flex items-center justify-center">
          <Swords className="text-green-400" size={36} />
        </div>
      </div>
      <div>
        <h2 className="text-2xl font-bold mb-1">Finding Opponent</h2>
        <p className="text-slate-400">Queue position: #{queuePosition}</p>
        <p className="text-slate-500 text-sm mt-1">Searching for players near your skill level...</p>
      </div>
      <button
        onClick={onCancel}
        className="border border-white/10 hover:border-red-500/50 text-slate-400 hover:text-red-400 px-6 py-2.5 rounded-xl transition-all text-sm"
      >
        Cancel Search
      </button>
    </div>
  );
}
