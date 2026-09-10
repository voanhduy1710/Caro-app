export interface MatchRecord {
  id: string;
  player1Uid: string;
  player2Uid: string;
  player1Name: string;
  player2Name: string;
  winnerUid: string | 'DRAW' | null;
  winnerName: string;
  boardSize: number;
  /** Match type persisted to gomoku_matches.mode (NOT NULL in the schema). */
  mode?: string;
  timerConfig: string;
  eloDeltaPlayer1: number;
  eloDeltaPlayer2: number;
  timestamp: number;
}
