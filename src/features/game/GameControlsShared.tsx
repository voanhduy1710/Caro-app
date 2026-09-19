import React from 'react';
import type { DisplayPrefs } from './displayPrefs';
import type { UserProfile } from '../auth/AuthContext';
import type { ChatMessage } from '../webrtc/types';
import { Loader2 } from 'lucide-react';

export interface GameControlsProps {
  headerNode?: React.ReactNode;
  boardNode?: React.ReactNode;
  opponent: UserProfile | null;
  myUser: UserProfile | null;
  chatMessages: ChatMessage[];
  onSendChat: (text: string, image?: string) => void;
  onSendBuzz?: () => boolean | void;
  onProposeUndo: () => void;
  onProposeRematch: () => void;
  onResign: () => void;
  /** Leaves the match: back home from practice, out of the room online. */
  onExitMatch: () => void;
  /** Names where the exit goes, e.g. "Leave room". */
  exitLabel: string;
  gameStatus: 'lobby' | 'playing' | 'ended';
  allowUndo: boolean;
  /** Practice has no opponent to chat with, react to or buzz. */
  isAiMode: boolean;
  /** False when there is no move to take back yet. */
  canUndo: boolean;
  /** A take-back has been asked for and the opponent has not answered. */
  undoPending: boolean;
  /** A rematch has been offered and the opponent has not answered. */
  rematchPending: boolean;
  /** A viewer watches and chats; only a player gets the game's actions. */
  role?: 'player' | 'viewer';
  /** Everyone in the room, shown under the seats. */
  rosterNode?: React.ReactNode;
  /** The id this client's own chat lines carry. Defaults to the signed-in uid. */
  myChatId?: string | null;
  /** A chat author's current avatar, when the room still knows them. */
  avatarFor?: (message: ChatMessage) => string | null | undefined;
  /** The seat a viewer could take right now, if any. */
  openSeat?: 'X' | 'O' | 'T' | null;
  onTakeSeat?: () => void;
  /** Overrides when Resign is available: in a room, only while both seats are filled. */
  canResign?: boolean;
  chatEmptyText?: string;
  /** Overall elapsed time, shown at the end of the action rail. */
  elapsedGameTime?: number;
}

export const REACTION_ICONS = [
  { id: 'smirk', label: 'Smirk', emoji: '😏' },
  { id: 'laugh', label: 'Laugh', emoji: '😂' },
  { id: 'smile', label: 'Smile', emoji: '😊' },
  { id: 'grin', label: ':D', emoji: '😃' },
  { id: 'tongue', label: ':P', emoji: '😛' },
  { id: 'gasp', label: ':O', emoji: '😮' },
  { id: 'lmao', label: 'Lmao', emoji: '🤣' },
  { id: 'gg', label: 'GG', emoji: '🤝' },
];

/** The three board settings worth reaching for without leaving the match. */
export const PREF_ROWS: Array<{ key: keyof DisplayPrefs; label: string }> = [
  { key: 'showCoordinates', label: 'Show coordinates' },
  { key: 'markLastMove', label: 'Mark the last move' },
  { key: 'soundEnabled', label: 'Sound' },
];

export const CHAT_OPEN_STORAGE_KEY = 'caro_chat_panel_open';
/** How close to the bottom still counts as "following the conversation". */
export const STICK_TO_BOTTOM_PX = 56;
/** How long to keep re-pinning the feed after a message, in milliseconds. */
export const PIN_TO_BOTTOM_MS = 250;
/**
 * Height of the phone's fixed chat bar. The page reserves the same height under
 * the action rail, so the bar is pinned to it rather than sized by its content.
 */
export const CHAT_BAR_HEIGHT_PX = 60;

export const processImageFile = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    // Keep GIF bytes untouched. Drawing one to canvas would flatten its
    // animation into a single JPEG frame before it ever reaches the peer.
    if (file.type === 'image/gif') {
      reader.onload = (event) => resolve(event.target?.result as string);
      reader.onerror = (err) => reject(err);
      reader.readAsDataURL(file);
      return;
    }
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

export const formatTime = (timestamp: number) => {
  try {
    return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
};

export const formatElapsed = (seconds: number): string => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const mm = m.toString().padStart(2, '0');
  const ss = s.toString().padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
};

/**
 * Whether the desktop chat column starts open: as the player last left it, and
 * open when nothing is saved. A phone never reads it. There the chat is a sheet
 * over the board, and restoring a column left open on a wide window covered the
 * board before the first move.
 */
export const readStoredChatOpen = () => {
  try {
    return localStorage.getItem(CHAT_OPEN_STORAGE_KEY) !== 'closed';
  } catch {
    return true;
  }
};

export interface RailButtonProps {
  icon: React.ReactNode;
  /** The action's name. Carried by the tooltip and by the accessible label. */
  label: string;
  /** The longer sentence, when the action needs one to be understood. */
  title?: string;
  onClick: () => void;
  disabled?: boolean;
  /** Asked for, and waiting on the opponent's answer. */
  pending?: boolean;
  tone?: 'default' | 'primary' | 'danger' | 'warning';
}

/**
 * One action in the match rail. The rail is 240px wide at its narrowest, where
 * five named buttons wrapped onto three lines and read as a pile rather than as
 * a toolbar, so each action is an icon and keeps its name in the tooltip and in
 * the accessible label. An action waiting on the opponent spins in place, which
 * says "sent, still waiting" without the button changing width.
 */
export const RailButton: React.FC<RailButtonProps> = ({
  icon,
  label,
  title,
  onClick,
  disabled = false,
  pending = false,
  tone = 'default',
}) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled || pending}
    title={title ? `${label} — ${title}` : label}
    aria-label={label}
    className={`btn btn-icon h-10 w-10 rounded-full ${
      tone === 'primary' ? 'btn-primary' : tone === 'warning' ? 'bg-warning-solid text-warning-fg hover:brightness-95' : 'btn-ghost'
    } ${tone === 'danger' ? 'text-danger hover:text-danger disabled:text-muted' : ''}`}
  >
    {pending ? (
      <Loader2 size={17} strokeWidth={2.25} className="animate-spin" aria-hidden="true" />
    ) : (
      icon
    )}
  </button>
);
