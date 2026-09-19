import React from 'react';
import { Board } from '../features/game/Board';
import type { BoardCorner } from '../features/game/Board';
import { GameControls } from '../features/game/GameControls';
import { MatchHeader } from '../features/game/MatchHeader';
import type { UserProfile } from '../features/auth/AuthContext';
import type { RoomSettings } from '../features/settings/types';
import type { BoardMatrix } from '../shared/utils/gomokuLogic';
import { BOT_USER, describeResultReason, TRIANGLE_BOT_USER } from './AppViewShared';
import type { MoveHistoryItem, PracticePiece } from './AppViewShared';

export interface PracticeMatchViewProps {
  user: UserProfile | null; openProfileModal: () => void; setOpponent: (user: UserProfile) => void;
  settings: RoomSettings; board: BoardMatrix; placementCorners: Record<string, BoardCorner>; onCellClick: (row: number, col: number, corner: BoardCorner) => void;
  lastMove: [number, number] | null; winningLine: Array<[number, number]> | null; currentTurn: PracticePiece; myPiece: PracticePiece;
  gameStatus: 'lobby' | 'playing' | 'ended'; gameResult: { winner: string; reason: string } | null; ratingNote: string | null;
  p1TotalTime: number; p2TotalTime: number; turnTimeLeft: number; isAiThinking: boolean; elapsedGameTime: number; moveHistory: MoveHistoryItem[];
  sessionScore: { mine: number; theirs: number; triangle: number }; onUndo: () => void; onRematch: () => void; onExit: () => void;
}

export const PracticeMatchView: React.FC<PracticeMatchViewProps> = (p) => {
  const three = p.settings.playerMode === 'oneVsOneVsOne';
  const botPiece: PracticePiece = p.myPiece === 'X' ? 'O' : 'X';
  const myTurn = p.gameStatus === 'playing' && p.currentTurn === p.myPiece;
  const botTurn = p.gameStatus === 'playing' && (p.currentTurn === 'O' || (three && p.currentTurn === 'T'));
  const player = { name: p.user?.displayName || 'You', photoURL: p.user?.photoURL, piece: p.myPiece, clock: p.myPiece === 'X' ? p.p1TotalTime : p.p2TotalTime, moveClock: myTurn ? p.turnTimeLeft : 0, isTurn: myTurn, tag: 'You', onClick: p.openProfileModal, title: 'View and edit your profile' };
  const bot = { name: BOT_USER.displayName, photoURL: BOT_USER.photoURL, piece: botPiece, clock: botPiece === 'X' ? p.p1TotalTime : p.p2TotalTime, moveClock: botTurn ? p.turnTimeLeft : 0, isTurn: botTurn, tag: p.isAiThinking ? 'Thinking' : undefined, onClick: () => p.setOpponent(BOT_USER), title: "View opponent's profile and stats" };
  const triangle = { name: TRIANGLE_BOT_USER.displayName, photoURL: TRIANGLE_BOT_USER.photoURL, piece: 'T' as const, clock: 0, moveClock: p.currentTurn === 'T' ? p.turnTimeLeft : 0, isTurn: p.currentTurn === 'T', tag: p.currentTurn === 'T' && p.isAiThinking ? 'Thinking' : undefined, onClick: () => p.setOpponent(TRIANGLE_BOT_USER), title: "View opponent's profile and stats" };
  return <GameControls headerNode={<MatchHeader seats={three ? [player, bot, triangle] : [player, bot]} score={three ? [p.sessionScore.mine, p.sessionScore.theirs, p.sessionScore.triangle] : [p.sessionScore.mine, p.sessionScore.theirs]} announcement={p.gameStatus === 'playing' ? (myTurn ? 'Your turn' : 'Your opponent’s turn') : 'Match ended'} scoreLabel={three ? `Score: you ${p.sessionScore.mine}, O bot ${p.sessionScore.theirs}, triangle bot ${p.sessionScore.triangle}` : `Score: you ${p.sessionScore.mine}, opponent ${p.sessionScore.theirs}`} />} boardNode={<div className="flex-1 flex flex-col items-center"><Board board={p.board} size={p.settings.boardSize} lmaoMode={p.settings.placementMode === 'lmao'} threePlayer={three} placementCorners={p.placementCorners} onCellClick={p.onCellClick} lastMove={p.lastMove} winningLine={p.winningLine} currentTurn={p.currentTurn} disabled={p.gameStatus !== 'playing' || p.currentTurn !== p.myPiece} myPiece={p.myPiece} opponent={BOT_USER} gameStatus={p.gameStatus} gameResult={p.gameResult} resultReason={describeResultReason(p.gameResult?.reason)} ratingNote={p.ratingNote} /></div>} opponent={BOT_USER} myUser={p.user} chatMessages={[]} onSendChat={() => undefined} onProposeUndo={p.onUndo} onProposeRematch={p.onRematch} onResign={() => undefined} onExitMatch={p.onExit} exitLabel="Exit practice" gameStatus={p.gameStatus} allowUndo={p.settings.allowUndo} isAiMode elapsedGameTime={p.elapsedGameTime} canUndo={p.moveHistory.length > 0} undoPending={false} rematchPending={false} />;
};
