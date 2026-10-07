import { useSyncExternalStore } from 'react';
import type { ChatMessage } from '../webrtc/types';

/**
 * The Spreadsheet theme's wiring. The Sheets chrome lives inside Board, but the
 * things it has to drive (take back, rematch, resign, leave, chat) live in
 * GameControls and in the screens above it, which Board never sees. Rather than
 * thread a dozen props through every call site, each side publishes what it
 * owns into one of these small stores and the chrome reads them.
 *
 * Every store is in-memory except the two names a player types (the document
 * title and the game tab's name), which survive a reload.
 */

type Listener = () => void;

interface Store<T> {
  get: () => T;
  set: (next: T | ((prev: T) => T)) => void;
  subscribe: (listener: Listener) => () => void;
}

const createStore = <T,>(initial: T): Store<T> => {
  let value = initial;
  const listeners = new Set<Listener>();
  return {
    get: () => value,
    set: (next) => {
      const resolved = typeof next === 'function' ? (next as (prev: T) => T)(value) : next;
      if (Object.is(resolved, value)) return;
      value = resolved;
      listeners.forEach((listener) => listener());
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
};

const useStore = <T,>(store: Store<T>) => useSyncExternalStore(store.subscribe, store.get, store.get);

/* --------------------------------- actions -------------------------------- */

/** One real game action, as the chrome needs it: run it, or show why it can't. */
export interface SheetAction {
  run: () => void;
  disabled: boolean;
  /** Asked for and waiting on the other player. */
  pending: boolean;
  /** The real action's name, for the accessible label. */
  label: string;
}

/**
 * Published by GameControls (exit, undo, rematch, resign, takeSeat) and by
 * OnlineRoom (share). A null entry means that action does not exist here,
 * e.g. resign in practice or take-back for a viewer.
 */
export interface SheetActions {
  exit: SheetAction | null;
  undo: SheetAction | null;
  rematch: SheetAction | null;
  resign: SheetAction | null;
  takeSeat: SheetAction | null;
  share: SheetAction | null;
}

export const EMPTY_SHEET_ACTIONS: SheetActions = {
  exit: null,
  undo: null,
  rematch: null,
  resign: null,
  takeSeat: null,
  share: null,
};

export const sheetActionsStore = createStore<SheetActions>(EMPTY_SHEET_ACTIONS);
export const useSheetActions = () => useStore(sheetActionsStore);

/* ---------------------------------- match --------------------------------- */

/** A seat as the disguise shows it: an "editor" in the document. */
export interface SheetSeat {
  name: string;
  piece: 'X' | 'O' | 'T';
  isTurn: boolean;
  isMe: boolean;
  /** Total seconds left, 0 when the match has no total clock. */
  clock: number;
  /** Seconds left for the move in hand, 0 when there is no move clock. */
  moveClock: number;
  empty: boolean;
}

/** Published by App (practice) and OnlineRoom (rooms) alongside MatchHeader. */
export interface SheetMatch {
  seats: SheetSeat[];
  /** Rounds won this sitting, in seat order. */
  score: number[];
  isAiMode: boolean;
  role: 'player' | 'viewer';
}

export const sheetMatchStore = createStore<SheetMatch | null>(null);
export const useSheetMatch = () => useStore(sheetMatchStore);

/* ---------------------------------- chat ---------------------------------- */

/** Published by GameControls. The disguise shows chat as a comments panel. */
export interface SheetChat {
  messages: ChatMessage[];
  /** Sends a comment, optionally with an image or as a reply to an earlier one. */
  send: (text: string, image?: string, replyTo?: ChatMessage) => void;
  isOwn: (message: ChatMessage) => boolean;
  /** Messages that arrived while the comments panel was closed. */
  unread: number;
  /** Practice has nobody to talk to. */
  available: boolean;
  /**
   * Answers a double-down offer riding in the chat. The panel shows it as a
   * suggested edit with Accept and Reject, the way Sheets shows suggestions.
   */
  answerOffer?: (accept: boolean) => void;
  /** Buzzes the opponent. Missing for viewers and in practice. */
  buzz?: () => void;
  /** A buzz was just sent and the next one has to wait. */
  buzzCooldown: boolean;
}

export const sheetChatStore = createStore<SheetChat | null>(null);
export const useSheetChat = () => useStore(sheetChatStore);

/* ----------------------------------- ui ----------------------------------- */

/** Which sheet tab is showing: the game, or one of the two fake reports. */
export type SheetView = 'game' | 'finance' | 'balance';

export const SHEET_ZOOM_STEPS = [0.5, 0.75, 0.9, 1, 1.25, 1.5, 2] as const;

export interface SheetUi {
  /** The comments (chat) panel beside the grid while disguised. */
  commentsOpen: boolean;
  /** Ctrl+Q flips to a fake report and back; the tabs switch too. */
  view: SheetView;
  /** Multiplier on the fitted cell size. 1 is "100%". */
  zoom: number;
  /** The document name in the title bar and the browser tab. */
  title: string;
  /** The name on the game's own sheet tab. */
  gameTabName: string;
  /** The keyboard-shortcut help dialog from the Help menu. */
  helpOpen: boolean;
}

const TITLE_KEY = 'caro_sheet_title';
const TAB_KEY = 'caro_sheet_game_tab';
export const DEFAULT_SHEET_TITLE = 'Báo cáo dự án - Tháng 10';
export const DEFAULT_GAME_TAB = 'Trang tính1';

const readStored = (key: string, fallback: string) => {
  try {
    const value = localStorage.getItem(key);
    return value && value.trim() ? value : fallback;
  } catch {
    return fallback;
  }
};

const writeStored = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    // A renamed document is a convenience, not something worth failing over.
  }
};

export const sheetUiStore = createStore<SheetUi>({
  commentsOpen: false,
  view: 'game',
  zoom: 1,
  title: readStored(TITLE_KEY, DEFAULT_SHEET_TITLE),
  gameTabName: readStored(TAB_KEY, DEFAULT_GAME_TAB),
  helpOpen: false,
});
export const useSheetUi = () => useStore(sheetUiStore);

export const updateSheetUi = (patch: Partial<SheetUi>) => {
  sheetUiStore.set((prev) => {
    const next = { ...prev, ...patch };
    if (patch.title !== undefined) writeStored(TITLE_KEY, next.title.trim() || DEFAULT_SHEET_TITLE);
    if (patch.gameTabName !== undefined) writeStored(TAB_KEY, next.gameTabName.trim() || DEFAULT_GAME_TAB);
    return next;
  });
};

/** Next or previous zoom step from the current one. */
export const stepSheetZoom = (direction: 1 | -1) => {
  const { zoom } = sheetUiStore.get();
  const index = SHEET_ZOOM_STEPS.findIndex((step) => step >= zoom - 1e-6);
  const current = index === -1 ? SHEET_ZOOM_STEPS.length - 1 : index;
  const target = Math.min(SHEET_ZOOM_STEPS.length - 1, Math.max(0, current + direction));
  updateSheetUi({ zoom: SHEET_ZOOM_STEPS[target] });
};

/* --------------------------------- events --------------------------------- */

/** Asks App to open the full Settings dialog; the navbar that normally does is hidden. */
export const OPEN_SETTINGS_EVENT = 'caro:open-settings';
