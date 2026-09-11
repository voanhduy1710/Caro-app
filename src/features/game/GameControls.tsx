import React, { useState, useRef, useEffect } from 'react';
import type { UserProfile } from '../auth/AuthContext';
import type { ChatMessage } from '../webrtc/types';

interface GameControlsProps {
  myPiece: 'X' | 'O';
  currentTurn: 'X' | 'O';
  turnTimeLeft: number;
  myTotalTimeLeft: number;
  opponentTotalTimeLeft: number;
  opponent: UserProfile | null;
  myUser: UserProfile | null;
  chatMessages: ChatMessage[];
  lastReaction: { emoji: string; sender: string } | null;
  onSendChat: (text: string, image?: string) => void;
  onSendReaction: (emoji: string) => void;
  onSendBuzz?: () => void;
  onProposeUndo: () => void;
  onProposeRematch: () => void;
  onResign: () => void;
  gameStatus: 'lobby' | 'playing' | 'ended';
  allowUndo: boolean;
  boardSize: number;
}

const REACTION_ICONS = [
  { id: 'smirk', label: 'Smirk', emoji: '😏' },
  { id: 'laugh', label: 'Laugh', emoji: '😂' },
  { id: 'smile', label: 'Smile', emoji: '😊' },
  { id: 'grin', label: ':D', emoji: '😃' },
  { id: 'tongue', label: ':P', emoji: '😛' },
  { id: 'gasp', label: ':O', emoji: '😮' },
  { id: 'lmao', label: 'Lmao', emoji: '🤣' },
  { id: 'gg', label: 'GG', emoji: '🤝' },
];

const processImageFile = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const MAX_DIM = 1000;
        let width = img.width;
        let height = img.height;

        if (width > MAX_DIM || height > MAX_DIM) {
          if (width > height) {
            height = Math.round((height * MAX_DIM) / width);
            width = MAX_DIM;
          } else {
            width = Math.round((width * MAX_DIM) / height);
            height = MAX_DIM;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', 0.85));
        } else {
          resolve(event.target?.result as string);
        }
      };
      img.onerror = (err) => reject(err);
      img.src = event.target?.result as string;
    };
    reader.onerror = (err) => reject(err);
    reader.readAsDataURL(file);
  });
};

export const GameControls: React.FC<GameControlsProps> = ({
  myPiece,
  myUser,
  chatMessages,
  onSendChat,
  onSendBuzz,
  onProposeUndo,
  onProposeRematch,
  onResign,
  gameStatus,
  allowUndo,
  boardSize,
}) => {
  const [chatText, setChatText] = useState('');
  const [attachedImage, setAttachedImage] = useState<string | null>(null);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  const [isBuzzCooldown, setIsBuzzCooldown] = useState(false);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom of chat feed when new messages arrive
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  // Auto-expand textarea height from 1 line up to max 3 lines
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = '36px'; // Reset height to 1 line baseline
      const scrollHeight = textareaRef.current.scrollHeight;
      const maxHeight = 76; // Max height for ~3 lines
      textareaRef.current.style.height = `${Math.min(Math.max(scrollHeight, 36), maxHeight)}px`;
    }
  }, [chatText]);

  const handleChatSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (chatText.trim() || attachedImage) {
      onSendChat(chatText.trim(), attachedImage || undefined);
      setChatText('');
      setAttachedImage(null);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleChatSubmit();
    }
  };

  const handlePaste = async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.indexOf('image') !== -1) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) {
          try {
            const resizedDataUrl = await processImageFile(file);
            setAttachedImage(resizedDataUrl);
          } catch (err) {
            console.error('Failed to process pasted image:', err);
          }
        }
        break;
      }
    }
  };



  const handleBuzzClick = () => {
    if (isBuzzCooldown || !onSendBuzz) return;
    onSendBuzz();
    setIsBuzzCooldown(true);
    setTimeout(() => setIsBuzzCooldown(false), 2000);
  };

  return (
    <div className="w-full h-full min-h-0 flex flex-col gap-4 overflow-hidden p-4 bg-white rounded-2xl border border-slate-300">
      {/* 1. Quick Action Buttons */}
      <div className="space-y-2">
        <div className="text-[10px] font-mono font-bold text-slate-500 uppercase tracking-wider">
          Game Actions
        </div>
        <div className="grid grid-cols-3 gap-2">
          {allowUndo && (
            <button
              onClick={onProposeUndo}
              disabled={gameStatus !== 'playing'}
              className="py-2 px-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 disabled:opacity-50 text-emerald-800 border border-emerald-300 text-xs font-bold transition cursor-pointer"
            >
              Undo Move
            </button>
          )}
          <button
            onClick={onProposeRematch}
            className="py-2 px-2 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border border-indigo-300 text-xs font-bold transition cursor-pointer"
          >
            Rematch
          </button>
          <button
            onClick={onResign}
            disabled={gameStatus !== 'playing'}
            className="py-2 px-2 rounded-xl bg-rose-50 hover:bg-rose-100 disabled:opacity-50 text-rose-800 border border-rose-300 text-xs font-bold transition cursor-pointer"
          >
            Resign
          </button>
        </div>

        {/* Reaction Icons Bar (Sends directly into chat) */}
        <div className="grid grid-cols-8 gap-1 p-1.5 bg-slate-50 rounded-xl border border-slate-200">
          {REACTION_ICONS.map((item) => (
            <button
              key={item.id}
              onClick={() => onSendChat(item.emoji)}
              title={item.label}
              className="py-1 px-0.5 hover:bg-slate-200 rounded text-base transition transform hover:scale-125 flex items-center justify-center cursor-pointer"
            >
              {item.emoji}
            </button>
          ))}
        </div>
      </div>

      {/* 2. Live Chat Feed Panel (Flexibly Expands to Match Board Height) */}
      <div className="flex-1 min-h-0 flex flex-col bg-slate-50 rounded-xl border border-slate-200 p-3">
        <div className="text-xs font-bold text-slate-700 border-b border-slate-200 pb-1.5 mb-2 flex justify-between items-center">
          <span>Chat</span>
          <span className="text-[10px] text-slate-500 font-mono">{chatMessages.length} msgs</span>
        </div>

        {/* Scrollable Chat Area Stretching Vertically */}
        <div className="chat-message-list flex-1 min-h-0 overflow-y-scroll overscroll-contain space-y-2 pr-1 text-xs">
          {chatMessages.length === 0 ? (
            <p className="text-[11px] text-slate-400 italic py-8 text-center">No messages yet. Send a greeting!</p>
          ) : (
            chatMessages.map((m) => {
              const isMe = myUser && m.sender === myUser.displayName;
              return (
                <div key={m.id} className={`flex ${isMe ? 'justify-start' : 'justify-end'}`}>
                  <div
                    className={`max-w-[85%] p-2 rounded-2xl border ${
                      isMe
                        ? 'bg-emerald-50/90 border-emerald-200 text-left rounded-tl-none'
                        : 'bg-rose-50/90 border-rose-200 text-right rounded-tr-none'
                    }`}
                  >
                    <div className="leading-snug">
                      <span className={`font-black ${isMe ? 'text-emerald-700' : 'text-rose-600'}`}>
                        {m.sender}:{' '}
                      </span>
                      {m.text && <span className="text-slate-800 font-medium whitespace-pre-wrap break-words">{m.text}</span>}
                    </div>

                    {m.image && (
                      <div className="mt-1.5">
                        <img
                          src={m.image}
                          alt="Attachment"
                          onClick={() => setLightboxImage(m.image || null)}
                          className="max-h-48 rounded-lg border border-slate-200 object-cover cursor-pointer hover:opacity-95 transition shadow-xs"
                        />
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
          <div ref={chatEndRef} />
        </div>

        {/* Image Attachment Preview */}
        {attachedImage && (
          <div className="relative pt-2 flex items-center gap-2">
            <div className="relative inline-block group">
              <img
                src={attachedImage}
                alt="Pasted attachment preview"
                className="h-16 w-16 object-cover rounded-lg border-2 border-emerald-500 shadow-xs"
              />
              <button
                type="button"
                onClick={() => setAttachedImage(null)}
                title="Remove image"
                className="absolute -top-1.5 -right-1.5 bg-rose-500 hover:bg-rose-600 text-white rounded-full w-5 h-5 text-[10px] font-bold flex items-center justify-center shadow transition cursor-pointer"
              >
                ✕
              </button>
            </div>
            <span className="text-[11px] text-slate-500 italic">Image ready to send</span>
          </div>
        )}

        <form onSubmit={handleChatSubmit} className="flex gap-1.5 pt-2.5 mt-2 border-t border-slate-200 items-end">

          <textarea
            ref={textareaRef}
            value={chatText}
            onChange={(e) => setChatText(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder="Type message..."
            title="Shift+Enter for newline, Ctrl+V to paste screenshot"
            rows={1}
            className="flex-1 min-w-0 bg-white border border-slate-300 rounded-lg px-2.5 py-2 text-xs text-slate-800 focus:outline-none focus:border-emerald-500 font-medium resize-none overflow-y-auto leading-tight"
            style={{ height: '36px', maxHeight: '76px' }}
          />

          <button
            type="submit"
            className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition shrink-0 h-9 flex items-center justify-center cursor-pointer"
          >
            Send
          </button>

          <button
            type="button"
            onClick={handleBuzzClick}
            disabled={isBuzzCooldown}
            title="Send Ting Ting sound to opponent"
            className="px-2.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-white font-bold text-xs transition flex items-center gap-1 shrink-0 shadow-xs active:scale-95 h-9 cursor-pointer"
          >
            <span>🔔</span>
            <span>{isBuzzCooldown ? '...' : 'Buzz'}</span>
          </button>
        </form>
      </div>

      {/* 3. Room Info Summary */}
      <div className="text-[11px] font-mono text-slate-500 bg-slate-100 p-2.5 rounded-xl border border-slate-200 flex justify-between shrink-0">
        <span>Grid: {boardSize}×{boardSize}</span>
        <span>Piece: {myPiece}</span>
      </div>

      {/* 4. Lightbox Image Modal */}
      {lightboxImage && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 cursor-pointer"
          onClick={() => setLightboxImage(null)}
        >
          <div className="relative max-w-4xl max-h-[90vh] flex flex-col items-center justify-center" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setLightboxImage(null)}
              className="absolute -top-10 right-0 text-white hover:text-slate-300 font-bold text-sm px-3 py-1 bg-slate-800/80 rounded-full cursor-pointer"
            >
              ✕ Close
            </button>
            <img
              src={lightboxImage}
              alt="Enlarged attachment preview"
              className="max-w-full max-h-[85vh] object-contain rounded-xl border border-slate-700 shadow-2xl"
            />
          </div>
        </div>
      )}
    </div>
  );
};
