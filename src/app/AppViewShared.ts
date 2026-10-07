import type React from 'react';
import type { ActiveRoomInfo } from '../features/webrtc/roomDiscoveryService';
import type { BoardCorner } from '../features/game/Board';
import type { UserProfile } from '../features/auth/AuthContext';
import type { RoomSettings } from '../features/settings/types';
import { getAvatarPublicUrl } from '../features/avatar/avatarService';

export type PracticePiece = 'X' | 'O' | 'T';
export interface MoveHistoryItem { row: number; col: number; piece: PracticePiece; corner?: BoardCorner; }
export const lmaoCornerFor = (row: number, col: number): BoardCorner => (['top-left', 'top', 'top-right', 'left', 'right', 'bottom-left', 'bottom', 'bottom-right'] as const)[Math.abs(row * 31 + col) % 8];
export const nextPracticePiece = (piece: PracticePiece, threePlayer: boolean): PracticePiece => threePlayer ? (piece === 'X' ? 'O' : piece === 'O' ? 'T' : 'X') : piece === 'X' ? 'O' : 'X';
const RESULT_REASONS: Record<string, string> = { '5_in_a_row': 'Five in a row completed the line.', board_full: 'The board filled up with nobody in a row.', turn_timeout: 'The clock for that move ran out.', total_time_out: 'A player used up their total time.', resigned: 'A player resigned.' };
export const describeResultReason = (reason?: string) => (reason && RESULT_REASONS[reason]) || 'The match is over.';
export const ROOM_STATUS_TEXT = (room: ActiveRoomInfo) => room.status === 'waiting' ? 'Waiting for a player' : room.status === 'playing' ? 'Playing' : room.status === 'paused' ? room.openSeat ? 'Paused, seat open' : 'Paused' : 'Finished';
export const stagger = (i: number) => ({ '--i': i }) as React.CSSProperties;
export type ConfirmCopy = { title: string; body: string; confirmLabel: string; };
export type ConfirmSpec = ConfirmCopy & {
  /**
   * The same question in Sheets' Vietnamese, shown instead while the
   * Spreadsheet disguise is up. Its logo and its Redo button lead here.
   */
  sheet?: ConfirmCopy;
  tone?: 'danger' | 'default';
  onConfirm: () => void;
};

/**
 * A room notice as the Spreadsheet disguise words it. The room's notices are
 * game talk in English; under the disguise they go out through the Sheets
 * snackbar, so each kind is said the way Sheets would say something like it,
 * and anything unrecognised falls back to a neutral line rather than leaking.
 */
const SHEET_NOTICES: Array<[RegExp, string]> = [
  [/declined/i, 'Yêu cầu đã bị từ chối'],
  [/expired/i, 'Yêu cầu đã hết hạn'],
  [/withdrawn/i, 'Yêu cầu đã được rút lại'],
  [/away too long|seat was given up/i, 'Phiên chỉnh sửa của bạn đã hết hạn'],
  [/not connected/i, 'Mất kết nối. Đang thử kết nối lại…'],
  [/message is too long/i, 'Nhận xét quá dài'],
  [/image is too large/i, 'Hình ảnh quá lớn'],
  [/slow down|give it|give the viewers/i, 'Vui lòng thử lại sau giây lát'],
];

export const sheetNoticeText = (message: string) =>
  SHEET_NOTICES.find(([pattern]) => pattern.test(message))?.[1] ?? 'Không thể thực hiện thao tác này';

/** The bots as the Spreadsheet disguise names them: colleagues editing the file. */
export const SHEET_BOT_NAME = 'Nguyễn Minh Anh';
export const SHEET_TRIANGLE_BOT_NAME = 'Trần Thu Hà';
export const BOT_USER: UserProfile = { uid: 'ai_bot', displayName: 'AI Bot 🤖', photoURL: getAvatarPublicUrl('Blitzcrank'), email: '', elo: 1350, wins: 50, losses: 50, draws: 10, streak: 0 };
export const TRIANGLE_BOT_USER: UserProfile = { uid: 'ai_triangle_bot', displayName: 'AI Triangle 🤖', photoURL: getAvatarPublicUrl('Leona'), email: '', elo: 1350, wins: 50, losses: 50, draws: 10, streak: 0 };
/** The practice bot always plays on 15x15: small enough to search deeply in the browser. */
export const AI_BOARD_SIZE = 15;
const AI_MAX_THINK_MS = 900;
/** Bot think time: 900 ms, or a quarter of the turn timer when that is shorter. */
export const aiThinkMs = (turnTimeSeconds: number): number => turnTimeSeconds > 0 ? Math.min(AI_MAX_THINK_MS, (turnTimeSeconds * 1000) / 4) : AI_MAX_THINK_MS;
/** Rules edited during practice must not leak the bot's 15x15 into the online room size. */
export const settingsUpdateFor = (current: RoomSettings, next: RoomSettings, inPractice: boolean): RoomSettings => inPractice ? { ...next, boardSize: current.boardSize } : next;
