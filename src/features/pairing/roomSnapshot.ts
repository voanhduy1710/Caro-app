/**
 * Mirrors a desktop room onto a paired phone. The desktop stays authoritative:
 * it sends a JSON snapshot of what OnlineRoom renders, and the phone renders the
 * same component with a RoomApi whose actions are sent back as calls.
 */
import { liveClocks } from '../room/roomEngineHelpers';
import type { Clocks, Game, RoomState } from '../room/roomEngineTypes';
import type { RoomApi } from '../room/useRoomCore';
import type { ChatMessage } from '../webrtc/types';

export type FunctionKeys<T> = { [K in keyof T]-?: T[K] extends (...args: never[]) => unknown ? K : never }[keyof T];

type TimingKey = 'clocksNow' | 'graceSecondsLeft' | 'hostNow';
type RoomMethod = Exclude<FunctionKeys<RoomApi>, TimingKey>;

// A Record keyed by RoomMethod fails to compile when RoomApi gains or loses a method.
const roomMethodSet: Record<RoomMethod, true> = {
  dismissTease: true, dismissSeatOpened: true, clearError: true,
  createRoom: true, joinRoom: true, leaveRoom: true, claimLostHostWin: true, reset: true, resumeFromUrl: true,
  takeSeat: true, becomeViewer: true, ping: true, clearPing: true, clearSeat: true, kickMember: true,
  move: true, requestUndo: true, answerUndo: true, offerDoubleDown: true, answerDoubleDown: true,
  offerRematch: true, answerRematch: true, resign: true, claimDisconnectWin: true, discardGame: true,
  updateSettings: true, chooseFirstMove: true, callCoin: true, buzz: true, tease: true,
  markChatSeen: true, sendChat: true,
};

/** Every function-valued key of RoomApi except the timing functions. */
export const ROOM_METHODS = Object.keys(roomMethodSet) as readonly RoomMethod[];

/** Methods that act on the phone's own session, never forwarded to or accepted by the desktop. */
export const LOCAL_ONLY_ROOM_METHODS = ['leaveRoom', 'dismissTease', 'dismissSeatOpened', 'clearError', 'createRoom', 'joinRoom', 'reset', 'resumeFromUrl'] as const;

const LOCAL_ONLY = new Set<string>(LOCAL_ONLY_ROOM_METHODS);
const CALLABLE = new Set<string>(ROOM_METHODS.filter((method) => !LOCAL_ONLY.has(method)));

export interface RoomSnapshot {
  fields: Record<string, unknown>;
  clocks: Clocks | null;
  graceByMember: Record<string, number | null>;
  hostNow: number;
}

type SnapshotChatMessage = Omit<ChatMessage, 'image'> & { hasImage?: true };

const stripImage = ({ image, ...message }: ChatMessage): SnapshotChatMessage => (image ? { ...message, hasImage: true } : message);

export const buildRoomSnapshot = (room: RoomApi): RoomSnapshot => {
  const fields: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(room)) {
    if (typeof value === 'function') continue;
    fields[key] = key === 'chatMessages' ? (value as ChatMessage[]).map(stripImage) : value;
  }
  const graceByMember: Record<string, number | null> = {};
  for (const member of room.state?.members ?? []) graceByMember[member.id] = room.graceSecondsLeft(member.id);
  return { fields, clocks: room.clocksNow(), graceByMember, hostNow: room.hostNow() };
};

export const chatImagesOf = (room: RoomApi): Array<{ id: string; image: string }> =>
  room.chatMessages.flatMap((message) => (message.image ? [{ id: message.id, image: message.image }] : []));

export const createRemoteRoomApi = (
  snap: RoomSnapshot,
  receivedAt: number,
  images: Record<string, string>,
  call: (method: string, args: unknown[]) => void,
  local: { leaveRoom: () => void },
): RoomApi => {
  const elapsed = () => performance.now() - receivedAt;
  const state = snap.fields.state as RoomState | null | undefined;
  const messages = (snap.fields.chatMessages ?? []) as SnapshotChatMessage[];
  const chatMessages = messages.map((message): ChatMessage => {
    const image = message.hasImage && Object.hasOwn(images, message.id) ? images[message.id] : undefined;
    return image ? { ...message, image } : message;
  });

  const methods: Record<string, (...args: unknown[]) => unknown> = {};
  for (const method of ROOM_METHODS) {
    if (method === 'leaveRoom') methods[method] = () => local.leaveRoom();
    else if (LOCAL_ONLY.has(method)) methods[method] = () => undefined;
    else if (method === 'sendChat') methods[method] = (...args) => { call(method, args); return Promise.resolve(); };
    else methods[method] = (...args) => { call(method, args); return true; };
  }

  const clocksNow = (): Clocks | null => {
    const game: Game | null | undefined = state?.game;
    if (!snap.clocks || !game) return snap.clocks;
    return state?.phase === 'playing' && snap.fields.status !== 'host_lost'
      ? liveClocks({ clocks: snap.clocks, turn: game.turn, settings: game.settings }, elapsed())
      : snap.clocks;
  };
  const graceSecondsLeft = (memberId: string): number | null => {
    const seconds = Object.hasOwn(snap.graceByMember, memberId) ? snap.graceByMember[memberId] : null;
    return seconds === null ? null : Math.max(0, Math.ceil(seconds - elapsed() / 1000));
  };
  const hostNow = () => snap.hostNow + elapsed();

  return { ...snap.fields, chatMessages, ...methods, clocksNow, graceSecondsLeft, hostNow } as unknown as RoomApi;
};

/** Runs a phone's call on the real room. False when the method is not one a phone may call, or it threw. */
export const applyRoomCall = (room: RoomApi, method: string, args: unknown[]): boolean => {
  if (!CALLABLE.has(method) || !Array.isArray(args)) return false;
  const fn = (room as unknown as Record<string, unknown>)[method];
  if (typeof fn !== 'function') return false;
  try {
    const result: unknown = fn.apply(room, args);
    if (result instanceof Promise) result.catch((error: unknown) => console.warn(`pairing: room call ${method} failed`, error));
    return true;
  } catch (error) {
    console.warn(`pairing: room call ${method} failed`, error);
    return false;
  }
};
