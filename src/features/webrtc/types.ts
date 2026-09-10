import type { UserProfile } from '../auth/AuthContext';

export type PeerMessageType =
  | 'JOIN_REQUEST'
  | 'ROOM_SETTINGS_SYNC'
  | 'GAME_START'
  | 'MOVE'
  | 'REACTION'
  | 'CHAT'
  | 'RECONNECT_PING'
  | 'RECONNECT_ACK'
  | 'GAME_STATE_SYNC'
  | 'GAME_STATE_REQUEST'
  | 'PROPOSE_UNDO'
  | 'ACCEPT_UNDO'
  | 'INSTANT_UNDO'
  | 'PROPOSE_REMATCH'
  | 'ACCEPT_REMATCH'
  | 'DECLINE_REMATCH'
  | 'DECLINE_UNDO'
  | 'READY_STATE'
  | 'LEAVE_ROOM'
  | 'GAME_OVER'
  | 'CLOCK_SYNC'
  | 'RATING_UPDATED'
  | 'BUZZ';

export interface ChatMessage {
  id: string;
  /** Stable author id. Display names are not unique, so ownership is keyed on this. */
  senderId?: string;
  sender: string;
  text: string;
  image?: string;
  timestamp: number;
  /** Locally generated notices (buzz) render as a centred system line. */
  system?: boolean;
}

export interface PeerMessage {
  type: PeerMessageType;
  payload: any;
}

export interface WebRTCState {
  roomId: string | null;
  isHost: boolean;
  isConnected: boolean;
  /** True from the moment a room is created or joined until it connects or fails. */
  isConnecting: boolean;
  /** Set when the other player left deliberately, so it never reads as a dropout. */
  peerLeft: boolean;
  isReconnecting: boolean;
  reconnectTimeLeft: number;
  connectionTimedOut: boolean;
  peerUser: UserProfile | null;
  error: string | null;
}
