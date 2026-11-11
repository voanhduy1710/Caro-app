/**
 * Mirrors a desktop room onto a paired phone. The desktop stays authoritative:
 * it sends a JSON snapshot of what OnlineRoom renders, and the phone renders the
 * same component with a RoomApi whose actions are sent back as calls.
 */
import { liveClocks } from '../room/roomEngineHelpers';
import type { Clocks, Game, RoomState } from '../room/roomEngineTypes';
import type { RoomApi } from '../room/useRoomCore';
import type { ChatMessage } from '../webrtc/types';
import { MAX_CALL_ARGS_JSON_LENGTH } from './pairProtocol';

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

/**
 * Drawn on the phone for a chat image the desktop could not send it (too big
 * for a broadcast) or has not sent yet.
 */
export const CHAT_IMAGE_PLACEHOLDER = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="120" viewBox="0 0 160 120">'
  + '<rect width="160" height="120" rx="8" fill="#8884"/>'
  + '<path d="M56 44h48v32H56z" fill="none" stroke="#8888" stroke-width="4"/>'
  + '<path d="M60 72l14-14 10 10 8-6 10 10" fill="none" stroke="#8888" stroke-width="4"/>'
  + '</svg>',
)}`;

export type ShrinkImage = (dataUrl: string, maxChars: number) => Promise<string | null>;

/**
 * The args a phone's sendChat goes over the wire with, or null when its image
 * cannot be made small enough for a call. The quoted message travels without
 * its picture (it keeps `hasImage`); the desktop looks the quote up by id.
 */
export const remoteChatArgs = async (
  text: string,
  image: string | undefined,
  replyTo: ChatMessage | undefined,
  shrink: ShrinkImage,
): Promise<unknown[] | null> => {
  const quote = replyTo ? stripImage(replyTo) : undefined;
  if (!image) return [text, undefined, quote];
  // The picture replaces the empty string, so this is what is left for it.
  const budget = MAX_CALL_ARGS_JSON_LENGTH - JSON.stringify([text, '', quote]).length;
  if (budget <= 0) return null;
  const picture = image.length <= budget ? image : await shrink(image, budget);
  return picture && picture.length <= budget ? [text, picture, quote] : null;
};

export interface RemoteRoomLocal {
  leaveRoom: () => void;
  /** Makes a data-URL image at most `maxChars` long, or null when it cannot. */
  shrinkImage?: ShrinkImage;
  /** The phone's chat image could not be made small enough to send. */
  onImageTooLarge?: () => void;
}

const noShrink: ShrinkImage = async () => null;

export const createRemoteRoomApi = (
  snap: RoomSnapshot,
  receivedAt: number,
  images: Record<string, string>,
  call: (method: string, args: unknown[]) => void,
  local: RemoteRoomLocal,
): RoomApi => {
  const elapsed = () => performance.now() - receivedAt;
  const state = snap.fields.state as RoomState | null | undefined;
  const messages = (snap.fields.chatMessages ?? []) as SnapshotChatMessage[];
  const chatMessages = messages.map((message): ChatMessage => {
    if (!message.hasImage) return message;
    const image = Object.hasOwn(images, message.id) ? images[message.id] : CHAT_IMAGE_PLACEHOLDER;
    return { ...message, image };
  });

  const sendChat = async (text: string, image?: string, replyTo?: ChatMessage): Promise<void> => {
    const args = await remoteChatArgs(text, image, replyTo, local.shrinkImage ?? noShrink);
    if (args) call('sendChat', args);
    else local.onImageTooLarge?.();
  };

  const methods: Record<string, (...args: unknown[]) => unknown> = {};
  for (const method of ROOM_METHODS) {
    if (method === 'leaveRoom') methods[method] = () => local.leaveRoom();
    else if (LOCAL_ONLY.has(method)) methods[method] = () => undefined;
    else if (method === 'sendChat') methods[method] = sendChat as (...args: unknown[]) => unknown;
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
/**
 * A phone quotes a message without its picture, so the desktop swaps in its own
 * copy of the quoted message (picture included) and the quote keeps its image mark.
 */
const withDesktopQuote = (room: RoomApi, args: unknown[]): unknown[] => {
  const reply: unknown = args[2];
  if (typeof reply !== 'object' || reply === null) return args;
  const { id } = reply as { id?: unknown };
  const own = typeof id === 'string' ? room.chatMessages.find((message) => message.id === id) : undefined;
  return own ? [args[0], args[1], own, ...args.slice(3)] : args;
};

export const applyRoomCall = (room: RoomApi, method: string, args: unknown[]): boolean => {
  if (!CALLABLE.has(method) || !Array.isArray(args)) return false;
  const fn = (room as unknown as Record<string, unknown>)[method];
  if (typeof fn !== 'function') return false;
  try {
    const result: unknown = fn.apply(room, method === 'sendChat' ? withDesktopQuote(room, args) : args);
    if (result instanceof Promise) result.catch((error: unknown) => console.warn(`pairing: room call ${method} failed`, error));
    return true;
  } catch (error) {
    console.warn(`pairing: room call ${method} failed`, error);
    return false;
  }
};
