import type { RoomSettings } from '../settings/types';
import type { Seat } from './protocol';

export type RoomStatus = 'idle' | 'opening' | 'joining' | 'connected' | 'host_lost' | 'closed' | 'error';
export type ClosedReason = 'host_left' | 'host_lost' | 'full' | 'superseded' | 'old_version' | 'not_found' | 'id_taken';

export interface TeaseNotice { fromMemberId: string; fromName: string; at: number; }
export interface SeatOpenedNotice { seat: Seat; at: number; }
export interface LastRoom { roomId: string; hostName: string; leftAt: number; reason: 'left' | 'dropped'; }
export interface RoomHandlers { onNotice?: (text: string) => void; onMoveApplied?: () => void; onBuzzed?: () => void; onTeased?: () => void; onRated?: () => void; }
export interface CreateRoomInput { code?: string; isPublic: boolean; settings: RoomSettings; }
