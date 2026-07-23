import React, { useState, useRef, useEffect } from 'react';
import { useGameStore } from '../../store/gameStore';
import { Send } from 'lucide-react';

export function Chat() {
  const { chatMessages, sendChatMessage } = useGameStore();
  const [inputText, setInputText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [chatMessages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;
    sendChatMessage(inputText);
    setInputText('');
  };

  return (
    <div className="flex flex-col h-64 bg-[#0E1223]/80 backdrop-blur-xl border border-white/5 rounded-2xl shadow-xl overflow-hidden mt-4">
      <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
        {chatMessages.length === 0 ? (
          <div className="text-slate-500 text-sm text-center italic mt-10">No messages yet. Say hi!</div>
        ) : (
          chatMessages.map((msg, i) => (
            <div key={i} className="text-sm">
              <span className="font-bold text-slate-300 mr-2">{msg.sender}:</span>
              <span className="text-slate-100">{msg.text}</span>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>
      <form onSubmit={handleSubmit} className="p-3 bg-white/[0.02] border-t border-white/5 flex gap-2">
        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder="Type a message..."
          className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-green-500/50 transition-colors placeholder:text-slate-500"
          maxLength={150}
        />
        <button
          type="submit"
          disabled={!inputText.trim()}
          className="bg-green-500 hover:bg-green-600 disabled:opacity-50 disabled:hover:bg-green-500 text-white p-2 rounded-lg transition-colors flex items-center justify-center"
        >
          <Send size={16} />
        </button>
      </form>
    </div>
  );
}
