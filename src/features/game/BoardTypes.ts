import type { BoardMatrix, CellValue } from '../../shared/utils/gomokuLogic';
import type { UserProfile } from '../auth/AuthContext';
import type React from 'react';

export type BoardCorner =
  | 'center' | 'top-left' | 'top' | 'top-right' | 'left' | 'right' | 'bottom-left' | 'bottom' | 'bottom-right';

export interface SimulatedMove {
  row: number;
  col: number;
  piece: Exclude<CellValue, null>;
}

export interface BoardProps {
  board: BoardMatrix;
  size: number;
  gameId?: string;
  onCellClick: (row: number, col: number, corner: BoardCorner) => void;
  lmaoMode?: boolean;
  threePlayer?: boolean;
  placementCorners?: Record<string, BoardCorner>;
  lastMove: [number, number] | null;
  winningLine: Array<[number, number]> | null;
  currentTurn: Exclude<CellValue, null>;
  disabled: boolean;
  myPiece?: Exclude<CellValue, null>;
  opponent?: UserProfile | null;
  gameStatus?: 'lobby' | 'playing' | 'ended';
  gameResult?: { winner: string; reason: string } | null;
  resultReason?: string;
  ratingNote?: string | null;
  countdown?: number | null;
  resultView?: { headline: string; tone: string; winnerPiece: Exclude<CellValue, null> | null } | null;
  countdownTitle?: string;
  countdownCaption?: string;
  coinFlip?: { winner: 'X' | 'O' | 'T' } | null;
  rpsReveal?: { X: 'rock' | 'paper' | 'scissors'; O: 'rock' | 'paper' | 'scissors'; winner: 'X' | 'O' } | null;
  preGame?: React.ReactNode | null;
  paused?: { title: string; body?: string; actions?: React.ReactNode } | null;
}
