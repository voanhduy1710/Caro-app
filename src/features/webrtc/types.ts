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
  | 'GAME_OVER'
  | 'BUZZ';

export interface ChatMessage {
  id: string;
  sender: string;
  text: string;
  image?: string;
  timestamp: number;
}

export interface PeerMessage {
  type: PeerMessageType;
  payload: any;
}

export interface WebRTCState {
  roomId: string | null;
  isHost: boolean;
  isConnected: boolean;
  isReconnecting: boolean;
  reconnectTimeLeft: number;
  connectionTimedOut: boolean;
  peerUser: UserProfile | null;
  error: string | null;
}
