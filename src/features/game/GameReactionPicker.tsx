import React from 'react';
import { REACTION_ICONS } from './GameControlsShared';

export const GameReactionPicker: React.FC<{ open: boolean; isAiMode: boolean; onSend: (emoji: string) => void; onClose: () => void }> = ({ open, isAiMode, onSend, onClose }) => {
  if (isAiMode || !open) return null;
  return <div className="grid grid-cols-8 gap-1 pb-2">{REACTION_ICONS.map((item) => <button key={item.id} onClick={() => { onSend(item.emoji); onClose(); }} title={item.label} aria-label={`Send ${item.label} reaction`} className="flex items-center justify-center rounded-sm px-0.5 py-1 text-base transition-transform hover:scale-110 hover:bg-surface-2 active:scale-95">{item.emoji}</button>)}</div>;
};
