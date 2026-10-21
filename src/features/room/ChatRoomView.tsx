import React, { useEffect, useRef, useState } from 'react';
import { Check, Copy, MessageCircle, Send } from 'lucide-react';
import type { ChatMessage } from '../webrtc/types';
import { GameChatFeed } from '../game/GameChatFeed';
import { GameChatLightbox } from '../game/GameChatLightbox';
import { STICK_TO_BOTTOM_PX } from '../game/GameControlsShared';
import type { Member, RoomState } from './roomEngine';
import type { RoomApi } from './useRoom';
import { useT } from '../i18n/language';

export interface ChatRoomViewProps {
  room: RoomApi; s: RoomState; me: string | null; members: Member[];
  copyState: 'idle' | 'copied' | 'failed'; roomLink: string; copyRoomLink: () => Promise<unknown>; requestExit: () => void;
  roster: React.ReactNode; hostLostStrip: React.ReactNode; confirmDialog: React.ReactNode;
}

/**
 * A room with no board: the invite, who is here, and the chat. It rides on the
 * same host-relayed room as a game, so nothing is stored anywhere.
 */
export const ChatRoomView: React.FC<ChatRoomViewProps> = ({ room, s, me, members, copyState, roomLink, copyRoomLink, requestExit, roster, hostLostStrip, confirmDialog }) => {
  const t = useT();
  const [text, setText] = useState('');
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [hasNewBelow, setHasNewBelow] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);
  const messages = room.chatMessages;

  const scrollToBottom = (smooth = false) => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
    stickRef.current = true;
    setHasNewBelow(false);
  };

  // Follow new lines only while the reader is already at the bottom.
  useEffect(() => {
    if (stickRef.current) scrollToBottom();
    else if (messages.length > 0) setHasNewBelow(true);
  }, [messages]);

  const onScroll = () => {
    const el = listRef.current;
    if (!el) return;
    stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight <= STICK_TO_BOTTOM_PX;
    if (stickRef.current) setHasNewBelow(false);
  };

  const send = (event?: React.FormEvent) => {
    event?.preventDefault();
    if (!text.trim()) return;
    void room.sendChat(text);
    setText('');
    stickRef.current = true;
  };

  const isOwn = (message: ChatMessage) => Boolean(me) && message.senderId === me;

  return (
    // Two columns on a wide screen: the invite and the people on the left, the
    // conversation filling the right. A phone stacks them, chat last.
    <div className="grid w-full max-w-6xl gap-4 text-left lg:grid-cols-2 lg:items-start">
      <div className="flex min-w-0 flex-col gap-4">
        <div className="panel space-y-3 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <span className="flex items-center gap-1.5 text-sm font-semibold text-ink">
                <MessageCircle size={15} strokeWidth={2.25} aria-hidden="true" />
                <span>{t('room.chat.title')}</span>
              </span>
              <span className="mt-0.5 block text-xs text-subtle">{t('room.chat.access')}</span>
            </div>
            <span className="font-mono text-lg font-semibold tracking-widest text-accent-text">{s.roomId}</span>
          </div>
          <div className="flex gap-2">
            <button onClick={copyRoomLink} className="btn btn-tonal btn-sm flex-1">
              {copyState === 'copied' ? <Check size={14} strokeWidth={2} aria-hidden="true" /> : <Copy size={14} strokeWidth={2.25} aria-hidden="true" />}
              <span>{copyState === 'copied' ? t('common.linkCopied') : t('common.copyInviteLink')}</span>
            </button>
            <button onClick={requestExit} className="btn btn-secondary btn-sm shrink-0">
              {room.isHost ? t('common.closeRoom') : t('common.leaveRoom')}
            </button>
          </div>
          {copyState === 'failed' && (
            <input type="text" readOnly value={roomLink} onFocus={(e) => e.currentTarget.select()} aria-label={t('room.chat.inviteLink')} className="field-input text-xs" />
          )}
        </div>

        <div className="-mx-3">{roster}</div>
      </div>

      <div className="panel flex h-[70dvh] min-h-80 min-w-0 flex-col p-3 lg:h-[calc(100dvh-7rem)]">
        <GameChatFeed
          messages={messages}
          emptyText={t('room.chat.empty')}
          opponent={null}
          avatarFor={(m) => members.find((member) => member.id === m.senderId)?.profile.avatar}
          listRef={listRef}
          onScroll={onScroll}
          isOwn={isOwn}
          onOpenImage={setLightbox}
          hasNewBelow={hasNewBelow}
          onShowNew={() => scrollToBottom(true)}
        />
        <form onSubmit={send} className="mt-2 flex items-center gap-2 border-t border-line pt-2">
          <input
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={t('room.chat.placeholder')}
            aria-label={t('room.chat.message')}
            autoComplete="off"
            className="field-input flex-1"
          />
          <button type="submit" disabled={!text.trim()} className="btn btn-primary btn-icon shrink-0" aria-label={t('room.chat.send')}>
            <Send size={16} strokeWidth={2.25} aria-hidden="true" />
          </button>
        </form>
      </div>

      {hostLostStrip}
      {confirmDialog}
      <GameChatLightbox image={lightbox} onClose={() => setLightbox(null)} />
    </div>
  );
};
