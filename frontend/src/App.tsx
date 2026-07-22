import React, { useEffect, useState } from 'react';
import { useAuthStore } from './store/authStore';
import { useGameStore } from './store/gameStore';
import { Lobby } from './components/Lobby/Lobby';
import { GameBoard } from './components/Game/GameBoard';
import { AuthPage } from './components/Auth/AuthPage';
import { ProfilePage } from './components/Profile/ProfilePage';

type View = 'lobby' | 'auth' | 'game' | 'profile';

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

  switch (view) {
    case 'auth':
      return <AuthPage onBack={() => setView('lobby')} />;
    case 'game':
      return <GameBoard onLeave={handleLeaveGame} />;
    case 'profile':
      return <ProfilePage onBack={() => setView('lobby')} />;
    default:
      return (
        <Lobby
          onAuthRequest={() => setView('auth')}
        />
      );
  }
}

export default App;
