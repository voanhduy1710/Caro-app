import React, { useCallback, useMemo } from 'react';
import { Check, Copy, MessageCircle } from 'lucide-react';
import type { ChatMessage } from '../webrtc/types';
import { useGameChat } from '../game/useGameChat';
import { useSheetAwareSound } from '../game/sheet/useSheetAwareSound';
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
 * same host-relayed room as a game, so nothing is stored anywhere. The chat is
 * the match's own (useGameChat): replies, reactions, images, buzz, the arrival
 * sound and "Seen" all behave exactly as they do mid-game.
 */
export const ChatRoomView: React.FC<ChatRoomViewProps> = ({ room, s, me, members, copyState, roomLink, copyRoomLink, requestExit, roster, hostLostStrip, confirmDialog }) => {
  const t = useT();
  const { playBuzzSound } = useSheetAwareSound();
  const messages = room.chatMessages;

  const isOwn = useCallback((message: ChatMessage) => Boolean(me) && message.senderId === me, [me]);

  // Nobody sits in a chat room, so "Seen" counts any other member who has
  // read up to this member's newest line or past it.
  const receipt = useMemo(() => {
    if (!me) return null;
    let mine = -1;
    for (let i = messages.length - 1; i >= 0 && mine < 0; i--) if (!messages[i].system && messages[i].senderId === me) mine = i;
    if (mine < 0) return null;
    const seen = members.some((member) => {
      if (member.id === me) return false;
      const upTo = room.chatSeen[member.id];
      return upTo !== undefined && messages.findIndex((line) => line.id === upTo) >= mine;
    });
    return { messageId: messages[mine].id, seen };
  }, [me, members, messages, room.chatSeen]);

  const chat = useGameChat({
    messages,
    isOwn,
    onSendChat: (text, image, replyTo) => void room.sendChat(text, image, replyTo),
    onSendBuzz: () => {
      const sent = room.buzz();
      if (sent) playBuzzSound();
      return sent;
    },
    role: 'player',
    visible: true,
    onChatSeen: room.markChatSeen,
    emptyText: t('room.chat.empty'),
    avatarFor: (m) => members.find((member) => member.id === m.senderId)?.profile.avatar,
    receipt,
  });

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
        <div className="flex min-h-0 flex-1 flex-col">{chat.feed}</div>
        <div className="mt-2">{chat.composer}</div>
      </div>

      {hostLostStrip}
      {confirmDialog}
      {chat.lightbox}
    </div>
  );
};
