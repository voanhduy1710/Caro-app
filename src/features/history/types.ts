export interface MatchRecord {
  id: string;
  player1Uid: string;
  player2Uid: string;
  player1Name: string;
  player2Name: string;
  winnerUid: string | 'DRAW' | null;
  winnerName: string;
  boardSize: number;
  timerConfig: string;
  eloDeltaPlayer1: number;
  eloDeltaPlayer2: number;
  timestamp: number;
}
