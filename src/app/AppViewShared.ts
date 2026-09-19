import type React from 'react';
import type { ActiveRoomInfo } from '../features/webrtc/roomDiscoveryService';
import type { BoardCorner } from '../features/game/Board';
import type { UserProfile } from '../features/auth/AuthContext';
import { getAvatarPublicUrl } from '../features/avatar/avatarService';

export type PracticePiece = 'X' | 'O' | 'T';
export interface MoveHistoryItem { row: number; col: number; piece: PracticePiece; corner?: BoardCorner; }
export const lmaoCornerFor = (row: number, col: number): BoardCorner => (['top-left', 'top', 'top-right', 'left', 'right', 'bottom-left', 'bottom', 'bottom-right'] as const)[Math.abs(row * 31 + col) % 8];
export const nextPracticePiece = (piece: PracticePiece, threePlayer: boolean): PracticePiece => threePlayer ? (piece === 'X' ? 'O' : piece === 'O' ? 'T' : 'X') : piece === 'X' ? 'O' : 'X';
const RESULT_REASONS: Record<string, string> = { '5_in_a_row': 'Five in a row completed the line.', board_full: 'The board filled up with nobody in a row.', turn_timeout: 'The clock for that move ran out.', total_time_out: 'A player used up their total time.', resigned: 'A player resigned.' };
export const describeResultReason = (reason?: string) => (reason && RESULT_REASONS[reason]) || 'The match is over.';
export const ROOM_STATUS_TEXT = (room: ActiveRoomInfo) => room.status === 'waiting' ? 'Waiting for a player' : room.status === 'playing' ? 'Playing' : room.status === 'paused' ? room.openSeat ? 'Paused, seat open' : 'Paused' : 'Finished';
export const stagger = (i: number) => ({ '--i': i }) as React.CSSProperties;
export type ConfirmSpec = { title: string; body: string; confirmLabel: string; tone?: 'danger' | 'default'; onConfirm: () => void; };
export const BOT_USER: UserProfile = { uid: 'ai_bot', displayName: 'AI Bot 🤖', photoURL: getAvatarPublicUrl('Blitzcrank'), email: '', elo: 1350, wins: 50, losses: 50, draws: 10, streak: 0 };
export const TRIANGLE_BOT_USER: UserProfile = { uid: 'ai_triangle_bot', displayName: 'AI Triangle 🤖', photoURL: getAvatarPublicUrl('Leona'), email: '', elo: 1350, wins: 50, losses: 50, draws: 10, streak: 0 };
