import React, { useState } from 'react';
import { Globe, Users, Bot, BookOpen } from '../icons/Icons';
import { BotMenu } from '../modals/BotMenu';
import { PIECES } from '../pieces/Piece';
import type { BotDifficulty } from '../../types';

interface HomeViewProps {
  onStartGame: (mode: string, config?: { difficulty?: BotDifficulty }) => void;
  onRules: () => void;
  isOnlineEnabled?: boolean;
}

export const HomeView: React.FC<HomeViewProps> = ({ onStartGame, onRules, isOnlineEnabled = false }) => {
  const [showBotMenu, setShowBotMenu] = useState(false);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-gradient-to-b from-zinc-900 to-zinc-800 relative overflow-hidden">
      {/* Decorative background pattern */}
      <div className="absolute inset-0 opacity-[0.03]" style={{
        backgroundImage: `repeating-conic-gradient(#fff 0% 25%, transparent 0% 50%)`,
        backgroundSize: '60px 60px',
      }} />

      <div className="relative z-10 mb-14 text-center">
        <div className="flex justify-center mb-6">
          <div className="relative">
            <div className="w-28 h-28 rounded-3xl bg-gradient-to-br from-amber-700 via-amber-800 to-amber-950 flex items-center justify-center shadow-2xl shadow-amber-900/30 border border-amber-600/20">
              <svg viewBox="0 0 45 45" className="w-18 h-18 drop-shadow-lg">
                {PIECES['w']['n']}
              </svg>
            </div>
            <div className="absolute -inset-1 rounded-3xl bg-gradient-to-br from-amber-500/20 to-transparent -z-10 blur-sm" />
          </div>
        </div>
        <h1 className="text-5xl font-bold text-white tracking-tight mb-2">Modern Chess</h1>
        <p className="text-zinc-500 text-lg tracking-wide">Simple. Fast. Elegant.</p>
      </div>

      <div className="relative z-10 w-full max-w-xs space-y-3">
        <button
          onClick={() => isOnlineEnabled && onStartGame('online-menu')}
          disabled={!isOnlineEnabled}
          className={`w-full py-4 px-6 rounded-2xl font-bold text-lg flex items-center justify-center gap-3 transition-all ${
            isOnlineEnabled
              ? 'bg-blue-600 hover:bg-blue-500 active:scale-[0.98] text-white shadow-lg shadow-blue-600/20'
              : 'bg-zinc-800 text-zinc-500 cursor-not-allowed border border-zinc-700/50'
          }`}
        >
          <Globe size={22} /> Play Online
          {!isOnlineEnabled && <span className="text-xs opacity-60">(Setup Required)</span>}
        </button>
        <button
          onClick={() => onStartGame('pvp')}
          className="w-full py-4 px-6 bg-zinc-800 hover:bg-zinc-700 active:scale-[0.98] transition-all rounded-2xl font-bold text-lg text-zinc-100 flex items-center justify-center gap-3 border border-zinc-700/50"
        >
          <Users size={22} /> Pass & Play
        </button>
        <button
          onClick={() => setShowBotMenu(true)}
          className="w-full py-4 px-6 bg-zinc-800 hover:bg-zinc-700 active:scale-[0.98] transition-all rounded-2xl font-bold text-lg text-zinc-100 flex items-center justify-center gap-3 border border-zinc-700/50"
        >
          <Bot size={22} /> Play vs Bot
        </button>
        <button
          onClick={onRules}
          className="w-full py-4 px-6 bg-transparent border border-zinc-700 hover:bg-zinc-800/50 active:scale-[0.98] transition-all rounded-2xl font-semibold text-lg text-zinc-400 hover:text-zinc-300 flex items-center justify-center gap-3"
        >
          <BookOpen size={22} /> Rules
        </button>
      </div>

      <a
        href="https://theupcurious.com"
        target="_blank"
        rel="noreferrer"
        className="relative z-10 mt-12 text-[11px] text-white/20 hover:text-white/40 transition-colors"
      >
        by Upcurious
      </a>

      <BotMenu
        isOpen={showBotMenu}
        onClose={() => setShowBotMenu(false)}
        onSelect={(diff) => {
          setShowBotMenu(false);
          onStartGame('bot', { difficulty: diff });
        }}
      />
    </div>
  );
};
