import type { RoomSettings } from '../settings/types';
import type { ChatMessage } from '../webrtc/types';
import { CHAT_IMAGE_MAX, CHAT_TEXT_MAX, cryptoEnv, seatOf } from './roomEngine';
import type { RoomState } from './roomEngine';
import type { Intent, MoveCorner, Seat } from './protocol';
import { noteRequestedMove, noteResigned } from './ratingCheck';
import { shrinkImage } from './useRoomUtilities';

interface RoomActionState {
  mirror: RoomState | null;
  memberId: string | null;
  lastChatEcho: string | null;
}

interface CreateRoomActionsOptions {
  state: RoomActionState;
  sendIntent: (intent: Intent) => boolean;
  appendChat: (message: ChatMessage) => void;
  notice: (text: string) => void;
  setPendingMove: (move: [number, number] | null) => void;
  setChatMessages: (update: (messages: ChatMessage[]) => ChatMessage[]) => void;
}

export const createRoomActions = ({ state, sendIntent, appendChat, notice, setPendingMove, setChatMessages }: CreateRoomActionsOptions) => {
  const gameId = () => state.mirror?.game?.id ?? null;
  return {
    takeSeat: (seat: Seat) => sendIntent({ type: 'TAKE_SEAT', payload: { seat } }),
    becomeViewer: () => sendIntent({ type: 'LEAVE_SEAT', payload: {} }),
    clearSeat: (seat: Seat) => sendIntent({ type: 'CLEAR_SEAT', payload: { seat } }),
    move: (row: number, col: number, corner?: MoveCorner) => {
      const room = state.mirror;
      const game = room?.game;
      if (!room || !game || room.phase !== 'playing' || seatOf(room, state.memberId) !== game.turn) return false;
      const number = game.moves.length;
      noteRequestedMove(game.id, number, row, col);
      setPendingMove([row, col]);
      const sent = sendIntent({ type: 'MOVE', payload: { gameId: game.id, n: number, row, col, corner } });
      if (!sent) setPendingMove(null);
      return sent;
    },
    requestUndo: () => { const id = gameId(); return id ? sendIntent({ type: 'UNDO_REQUEST', payload: { gameId: id } }) : false; },
    answerUndo: (accept: boolean) => { const id = gameId(); return id ? sendIntent({ type: 'UNDO_ANSWER', payload: { gameId: id, accept } }) : false; },
    offerRematch: () => { const id = gameId(); return id ? sendIntent({ type: 'REMATCH_OFFER', payload: { gameId: id } }) : false; },
    answerRematch: (accept: boolean) => { const id = gameId(); return id ? sendIntent({ type: 'REMATCH_ANSWER', payload: { gameId: id, accept } }) : false; },
    resign: () => { const id = gameId(); if (!id) return false; noteResigned(id); return sendIntent({ type: 'RESIGN', payload: { gameId: id } }); },
    discardGame: () => { const id = gameId(); return id ? sendIntent({ type: 'DISCARD_GAME', payload: { gameId: id } }) : false; },
    updateSettings: (settings: RoomSettings) => sendIntent({ type: 'UPDATE_SETTINGS', payload: { settings } }),
    chooseFirstMove: (choice: 'rock' | 'paper' | 'scissors') => { const id = gameId(); return id ? sendIntent({ type: 'FIRST_MOVE_CHOICE', payload: { gameId: id, choice } }) : false; },
    callCoin: (call: 'X' | 'O') => { const id = gameId(); return id ? sendIntent({ type: 'COIN_CALL', payload: { gameId: id, call } }) : false; },
    buzz: () => sendIntent({ type: 'BUZZ', payload: {} }),
    tease: (targetMemberId: string) => sendIntent({ type: 'TEASE', payload: { targetMemberId } }),
    sendChat: async (text: string, image?: string) => {
      const trimmed = text.trim();
      if (!trimmed && !image) return;
      if (Array.from(trimmed).length > CHAT_TEXT_MAX) { notice(`That message is too long. Keep it under ${CHAT_TEXT_MAX} characters.`); return; }
      const picture = image ? await shrinkImage(image, CHAT_IMAGE_MAX) : undefined;
      if (image && !picture) { notice('That image is too large to send. Try a smaller screenshot.'); return; }
      const id = cryptoEnv.randomId(10);
      const member = state.mirror?.members.find((candidate) => candidate.id === state.memberId);
      const echo: ChatMessage = { id, senderId: state.memberId ?? undefined, sender: member?.profile.name ?? 'You', senderAvatar: member?.profile.avatar ?? null, text: trimmed, ...(picture ? { image: picture } : {}), timestamp: Date.now() };
      state.lastChatEcho = id;
      appendChat(echo);
      if (!sendIntent({ type: 'CHAT', payload: { id, text: trimmed, ...(picture ? { image: picture } : {}) } })) {
        setChatMessages((messages) => messages.filter((message) => message.id !== id));
        notice('Not connected to the room right now.');
      }
    },
  };
};
