import { useEffect, useState } from 'react';
import { useAuthStore } from './store/authStore';
import { useGameStore } from './store/gameStore';
import { Lobby } from './components/Lobby/Lobby';
import { GameBoard } from './components/Game/GameBoard';
import { AuthPage } from './components/Auth/AuthPage';
import { ProfilePage } from './components/Profile/ProfilePage';
import { Leaderboard } from './components/Leaderboard/Leaderboard';

type View = 'lobby' | 'auth' | 'game' | 'profile' | 'leaderboard';

function App() {
  const [view, setView] = useState<View>('lobby');
  const { fetchMe } = useAuthStore();
  const { phase, reset } = useGameStore();

  // Restore session on mount
  useEffect(() => {
    fetchMe();
  }, []);

  // Auto-navigate when game starts
  useEffect(() => {
    if (phase === 'playing' || phase === 'over') {
      setView('game');
    }
  }, [phase]);

  const handleLeaveGame = () => {
    reset();
    setView('lobby');
  };

  return (
    <>
      {(() => {
        switch (view) {
          case 'auth':
            return <AuthPage onBack={() => setView('lobby')} onSuccess={() => setView('lobby')} />;
          case 'game':
            return <GameBoard onLeave={handleLeaveGame} />;
          case 'profile':
            return <ProfilePage onBack={() => setView('lobby')} onReviewRequested={() => setView('game')} />;
          case 'leaderboard':
            return <Leaderboard onBack={() => setView('lobby')} />;
          default:
            return (
              <Lobby
                onAuthRequest={() => setView('auth')}
                onProfileRequest={() => setView('profile')}
                onLeaderboardRequest={() => setView('leaderboard')}
              />
            );
        }
      })()}
    </>
  );
}

export default App;
