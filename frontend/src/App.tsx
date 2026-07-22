import React, { useEffect, useState } from 'react';
import '@fontsource/fira-sans/400.css';
import '@fontsource/fira-sans/500.css';
import '@fontsource/fira-sans/600.css';
import '@fontsource/fira-sans/700.css';
import '@fontsource/fira-code/400.css';
import '@fontsource/fira-code/500.css';
import '@fontsource/fira-code/600.css';
import '@fontsource/fira-code/700.css';
import { useAuthStore } from './store/authStore';
import { useGameStore } from './store/gameStore';
import { Lobby } from './components/Lobby/Lobby';
import { GameBoard } from './components/Game/GameBoard';
import { AuthPage } from './components/Auth/AuthPage';
import { ProfilePage } from './components/Profile/ProfilePage';

type View = 'lobby' | 'auth' | 'game' | 'profile';

function ErrorOverlay() {
  const [errors, setErrors] = React.useState<string[]>([]);
  React.useEffect(() => {
    const originalError = console.error;
    const originalLog = console.log;
    console.error = (...args) => {
      setErrors(prev => [...prev, args.join(' ')]);
      originalError(...args);
    };
    console.log = (...args) => {
      setErrors(prev => [...prev, 'LOG: ' + args.map(a => typeof a === 'object' ? JSON.stringify(a, Object.getOwnPropertyNames(a)) : String(a)).join(' ')]);
      originalLog(...args);
    };
    window.addEventListener('error', (e) => setErrors(prev => [...prev, e.message]));
    return () => { 
      console.error = originalError; 
      console.log = originalLog;
    };
  }, []);
  if (errors.length === 0) return null;
  return (
    <div className="fixed top-0 left-0 z-[9999] w-full p-4 bg-red-900/90 text-white text-xs whitespace-pre-wrap max-h-64 overflow-auto pointer-events-none">
      {errors.map((e, i) => <div key={i} className="mb-2 border-b border-white/20 pb-1">{e}</div>)}
    </div>
  );
}

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
      <ErrorOverlay />
      {(() => {
        switch (view) {
          case 'auth':
            return <AuthPage onBack={() => setView('lobby')} onSuccess={() => setView('lobby')} />;
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
      })()}
    </>
  );
}

export default App;
