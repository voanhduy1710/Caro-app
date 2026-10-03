import React from 'react';
import { ArrowDown, Dices, Reply } from 'lucide-react';
import type { ChatMessage } from '../webrtc/types';
import type { UserProfile } from '../auth/AuthContext';
import { getAvatarPublicUrl } from '../avatar/avatarService';
import { formatTime, quoteSnippet } from './GameControlsShared';

export interface GameChatFeedProps {
  messages: ChatMessage[]; emptyText?: string; opponent: UserProfile | null; avatarFor?: (message: ChatMessage) => string | null | undefined;
  listRef: React.RefObject<HTMLDivElement | null>; onScroll: () => void; isOwn: (message: ChatMessage) => boolean;
  onOpenImage: (image: string | null) => void; hasNewBelow: boolean; onShowNew: () => void;
  /** Starts a reply to one message; without it the feed offers no reply button. */
  onReply?: (message: ChatMessage) => void;
  /** Answers a live double-down offer drawn in the feed. */
  onAnswerDoubleDown?: (accept: boolean) => void;
}

/** Brings the answered message into view and flashes it, when it is still in the feed. */
const jumpTo = (list: HTMLDivElement | null, id: string) => {
  const target = list?.querySelector<HTMLElement>(`[data-chat-id="${CSS.escape(id)}"]`);
  if (!target) return;
  target.scrollIntoView({ block: 'center', behavior: 'smooth' });
  target.classList.remove('chat-flash');
  void target.offsetWidth;
  target.classList.add('chat-flash');
};

export const GameChatFeed: React.FC<GameChatFeedProps> = ({ messages, emptyText, opponent, avatarFor, listRef, onScroll, isOwn, onOpenImage, hasNewBelow, onShowNew, onReply, onAnswerDoubleDown }) => <div className="relative flex-1 min-h-0"><div ref={listRef} onScroll={onScroll} className="chat-message-list h-full overflow-y-auto overscroll-contain space-y-2 pr-1 text-xs">{messages.length === 0 ? <p className="py-10 text-center text-[13px] text-subtle">{emptyText ?? 'No messages yet. Say hello to your opponent.'}</p> : messages.map((m) => {
  const mine = isOwn(m);
  if (m.system) return <div key={m.id} className="flex justify-center"><span className="chip max-w-full min-w-0 whitespace-normal break-words text-center text-[11px]">{m.text}</span></div>;
  if (m.doubleDownOffer) return <div key={m.id} data-chat-id={m.id} className="flex justify-center animate-pop-in">
    <div role="group" aria-label="Double down offer" className="w-full max-w-[17rem] rounded-md border border-orange-500/50 bg-orange-500/10 px-3 py-2.5 text-center">
      <div className="flex items-center justify-center gap-1.5 text-[13px] font-semibold text-ink"><Dices size={16} strokeWidth={2.25} className="shrink-0 text-orange-500" aria-hidden="true" /><span className="min-w-0 break-words">{m.text}</span></div>
      <p className="mt-0.5 text-[11px] text-muted">The winner gains and the loser loses 20 extra points. {m.doubleDownOffer.canAnswer ? 'You have' : 'The recipient has'} {m.doubleDownOffer.movesLeft} of {m.doubleDownOffer.canAnswer ? 'your' : 'their'} moves left to answer.</p>
      {m.doubleDownOffer.canAnswer && onAnswerDoubleDown
        ? <div className="mt-2 flex gap-2"><button type="button" onClick={() => onAnswerDoubleDown(true)} className="btn btn-sm flex-1 border-orange-500 bg-orange-500 text-white hover:bg-orange-600">Accept</button><button type="button" onClick={() => onAnswerDoubleDown(false)} className="btn btn-secondary btn-sm flex-1">Reject</button></div>
        : <p className="mt-1.5 text-[11px] font-medium text-orange-600">Waiting for an answer…</p>}
    </div>
  </div>;
  const replyButton = onReply && (
    <button type="button" onClick={() => onReply(m)} title="Reply" aria-label={`Reply to ${m.sender}`} className="btn btn-ghost btn-icon mb-1 h-7 w-7 shrink-0 rounded-full text-muted opacity-0 transition group-hover:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-60">
      <Reply size={14} strokeWidth={2.25} aria-hidden="true" />
    </button>
  );
  return <div key={m.id} data-chat-id={m.id} className={`group flex items-end gap-1.5 rounded-md ${mine ? 'justify-end' : 'justify-start'}`}>
    {!mine && <img src={getAvatarPublicUrl(avatarFor?.(m) ?? m.senderAvatar ?? opponent?.photoURL)} alt="" aria-hidden="true" onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = getAvatarPublicUrl(); }} className="w-6 h-6 rounded-full border border-line bg-surface object-contain shrink-0 mb-0.5" />}
    {mine && replyButton}
    <div className={`max-w-[78%] min-w-0 rounded-md border px-3 py-2 ${mine ? 'bg-accent border-accent text-accent-fg rounded-br-sm' : 'bg-surface border-line text-ink rounded-bl-sm'}`}>
      {!mine && <div className="text-[10px] font-semibold text-muted mb-0.5">{m.sender}</div>}
      {m.replyTo && <button type="button" onClick={() => jumpTo(listRef.current, m.replyTo!.id)} title="Show the message this answers" className={`mb-1 block w-full min-w-0 rounded-sm border-l-2 px-2 py-1 text-left text-[11px] leading-snug ${mine ? 'border-accent-fg/60 bg-accent-fg/15 text-accent-fg/85' : 'border-accent bg-surface-2 text-muted'}`}>
        <span className="block truncate font-semibold">{m.replyTo.sender}</span>
        <span className="block truncate">{quoteSnippet(m.replyTo)}</span>
      </button>}
      {m.text && <div className="text-[13px] leading-snug whitespace-pre-wrap break-words">{m.text}</div>}
      {m.image && <button type="button" onClick={() => onOpenImage(m.image || null)} className="mt-1.5 block cursor-pointer" title="Open image"><img src={m.image} alt="Attachment" className="max-h-44 rounded-sm border border-line object-cover hover:opacity-95 transition" /></button>}
      <div className={`mt-1 font-mono text-[10px] tabular-nums ${mine ? 'text-accent-fg/70' : 'text-subtle'}`}>{formatTime(m.timestamp)}</div>
    </div>
    {!mine && replyButton}
  </div>;
})}</div>{hasNewBelow && <button type="button" onClick={onShowNew} className="absolute bottom-2 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full bg-inverse px-3 py-1 text-[11px] font-medium text-inverse-fg shadow-lg transition hover:opacity-90">New messages<ArrowDown size={12} strokeWidth={2} aria-hidden="true" /></button>}</div>;
