import type { BoardMatrix, CellValue } from '../../shared/utils/gomokuLogic';

// Pattern Evaluation Scores
const SCORES = {
  WIN_5: 100000000,          // 5-in-a-row (WIN)
  BLOCK_WIN_5: 50000000,     // Block opponent's 5-in-a-row
  OPEN_4: 10000000,          // Open 4 (Unblocked at both ends -> Unstoppable)
  BLOCK_OPEN_4: 5000000,     // Block opponent's Open 4
  FOUR: 1000000,             // Four with 1 blocked end
  BLOCK_FOUR: 500000,        // Block opponent's Four
  OPEN_3: 100000,            // Open 3
  BLOCK_OPEN_3: 80000,       // Block opponent's Open 3
  THREE: 10000,              // Three with 1 blocked end
  BLOCK_THREE: 5000,         // Block opponent's Three
  OPEN_2: 1000,              // Open 2
  BLOCK_OPEN_2: 500,         // Block opponent's Open 2
  TWO: 100,                  // Two with 1 blocked end
  CENTER_BONUS: 10,          // Center proximity bonus
};

const DIRECTIONS: Array<[number, number]> = [
  [0, 1],   // Horizontal
  [1, 0],   // Vertical
  [1, 1],   // Diagonal Down-Right
  [1, -1],  // Diagonal Down-Left
];

/**
 * Gets candidate empty cells that are adjacent (within radius 2) to existing placed pieces.
 */
export const getCandidateMoves = (board: BoardMatrix, size: number, radius = 2): Array<[number, number]> => {
  const candidates: Array<[number, number]> = [];
  const visited = Array.from({ length: size }, () => Array(size).fill(false));
  let hasPieces = false;

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (board[r][c] !== null) {
        hasPieces = true;
        for (let dr = -radius; dr <= radius; dr++) {
          for (let dc = -radius; dc <= radius; dc++) {
            const nr = r + dr;
            const nc = c + dc;
            if (
              nr >= 0 &&
              nr < size &&
              nc >= 0 &&
              nc < size &&
              board[nr][nc] === null &&
              !visited[nr][nc]
            ) {
              visited[nr][nc] = true;
              candidates.push([nr, nc]);
            }
          }
        }
      }
    }
  }

  if (!hasPieces) {
    const center = Math.floor(size / 2);
    return [[center, center]];
  }

  return candidates;
};

/**
 * Evaluates a direction for a given player at a position (r, c) on board.
 */
const evaluateDirection = (
  board: BoardMatrix,
  r: number,
  c: number,
  dr: number,
  dc: number,
  size: number,
  player: CellValue
): { count: number; openEnds: number } => {
  let count = 1;
  let openEnds = 0;

  // Forward check
  let step = 1;
  while (true) {
    const nr = r + dr * step;
    const nc = c + dc * step;
    if (nr < 0 || nr >= size || nc < 0 || nc >= size) break;
    if (board[nr][nc] === player) {
      count++;
      step++;
    } else {
      if (board[nr][nc] === null) openEnds++;
      break;
    }
  }

  // Backward check
  step = 1;
  while (true) {
    const nr = r - dr * step;
    const nc = c - dc * step;
    if (nr < 0 || nr >= size || nc < 0 || nc >= size) break;
    if (board[nr][nc] === player) {
      count++;
      step++;
    } else {
      if (board[nr][nc] === null) openEnds++;
      break;
    }
  }

  return { count, openEnds };
};

/**
 * Evaluates score of placing a move for player or blocking opponent.
 */
export const evaluatePositionScore = (
  board: BoardMatrix,
  r: number,
  c: number,
  size: number,
  player: CellValue,
  opponent: CellValue
): number => {
  let score = 0;
  const center = Math.floor(size / 2);
  const centerDist = Math.abs(r - center) + Math.abs(c - center);
  score += Math.max(0, (size - centerDist) * SCORES.CENTER_BONUS);

  // Temporarily place move
  board[r][c] = player;

  // Evaluate offensive potential
  let openThreesAi = 0;
  let foursAi = 0;

  for (const [dr, dc] of DIRECTIONS) {
    const { count, openEnds } = evaluateDirection(board, r, c, dr, dc, size, player);
    if (count >= 5) {
      board[r][c] = null;
      return SCORES.WIN_5;
    }
    if (count === 4) {
      if (openEnds === 2) score += SCORES.OPEN_4;
      else if (openEnds === 1) score += SCORES.FOUR;
      foursAi++;
    } else if (count === 3) {
      if (openEnds === 2) {
        score += SCORES.OPEN_3;
        openThreesAi++;
      } else if (openEnds === 1) {
        score += SCORES.THREE;
      }
    } else if (count === 2) {
      if (openEnds === 2) score += SCORES.OPEN_2;
      else if (openEnds === 1) score += SCORES.TWO;
    }
  }

  // Double-three or Double-four tactical bonus for AI
  if (openThreesAi >= 2 || foursAi >= 2 || (foursAi >= 1 && openThreesAi >= 1)) {
    score += SCORES.OPEN_4;
  }

  // Remove temporary move & evaluate defensive block requirement against Opponent
  board[r][c] = opponent;

  let openThreesOpp = 0;
  let foursOpp = 0;

  for (const [dr, dc] of DIRECTIONS) {
    const { count, openEnds } = evaluateDirection(board, r, c, dr, dc, size, opponent);
    if (count >= 5) {
      board[r][c] = null;
      return SCORES.BLOCK_WIN_5;
    }
    if (count === 4) {
      if (openEnds === 2) score += SCORES.BLOCK_OPEN_4;
      else if (openEnds === 1) score += SCORES.BLOCK_FOUR;
      foursOpp++;
    } else if (count === 3) {
      if (openEnds === 2) {
        score += SCORES.BLOCK_OPEN_3;
        openThreesOpp++;
      } else if (openEnds === 1) {
        score += SCORES.BLOCK_THREE;
      }
    } else if (count === 2) {
      if (openEnds === 2) score += SCORES.BLOCK_OPEN_2;
    }
  }

  if (openThreesOpp >= 2 || foursOpp >= 2 || (foursOpp >= 1 && openThreesOpp >= 1)) {
    score += SCORES.BLOCK_OPEN_4;
  }

  // Revert cell back to empty
  board[r][c] = null;

  return score;
};

/**
 * Minimax with Alpha-Beta Pruning for deep lookahead (Depth 2-3).
 */
const minimax = (
  board: BoardMatrix,
  size: number,
  depth: number,
  alpha: number,
  beta: number,
  isMaximizing: boolean,
  aiPiece: CellValue,
  opponentPiece: CellValue
): number => {
  if (depth === 0) {
    let staticScore = 0;
    const candidates = getCandidateMoves(board, size, 1);
    for (const [r, c] of candidates) {
      staticScore += evaluatePositionScore(board, r, c, size, aiPiece, opponentPiece);
    }
    return staticScore;
  }

  const candidates = getCandidateMoves(board, size, 2);

  if (isMaximizing) {
    let maxEval = -Infinity;
    for (const [r, c] of candidates) {
      const score = evaluatePositionScore(board, r, c, size, aiPiece, opponentPiece);
      if (score >= SCORES.WIN_5) return score;

      board[r][c] = aiPiece;
      const evaluation = minimax(board, size, depth - 1, alpha, beta, false, aiPiece, opponentPiece);
      board[r][c] = null;

      maxEval = Math.max(maxEval, evaluation);
      alpha = Math.max(alpha, evaluation);
      if (beta <= alpha) break; // Prune branch
    }
    return maxEval;
  } else {
    let minEval = Infinity;
    for (const [r, c] of candidates) {
      const score = evaluatePositionScore(board, r, c, size, opponentPiece, aiPiece);
      if (score >= SCORES.WIN_5) return -score;

      board[r][c] = opponentPiece;
      const evaluation = minimax(board, size, depth - 1, alpha, beta, true, aiPiece, opponentPiece);
      board[r][c] = null;

      minEval = Math.min(minEval, evaluation);
      beta = Math.min(beta, evaluation);
      if (beta <= alpha) break; // Prune branch
    }
    return minEval;
  }
};

/**
 * Computes the optimal move for AI on current board.
 */
export const getBestAiMove = (
  board: BoardMatrix,
  size: number,
  aiPiece: 'X' | 'O' = 'O'
): [number, number] => {
  const opponentPiece: 'X' | 'O' = aiPiece === 'X' ? 'O' : 'X';
  const candidates = getCandidateMoves(board, size, 2);

  if (candidates.length === 0) {
    const center = Math.floor(size / 2);
    return [center, center];
  }

  let bestMove: [number, number] = candidates[0];
  let maxScore = -Infinity;

  // 1. Immediate Win / Immediate Block Check
  for (const [r, c] of candidates) {
    const score = evaluatePositionScore(board, r, c, size, aiPiece, opponentPiece);

    // If AI can win right now, take it immediately!
    if (score >= SCORES.WIN_5) {
      return [r, c];
    }
  }

  // 2. Alpha-Beta Minimax search over top scored candidates
  const scoredCandidates = candidates
    .map(([r, c]) => ({
      r,
      c,
      baseScore: evaluatePositionScore(board, r, c, size, aiPiece, opponentPiece),
    }))
    .sort((a, b) => b.baseScore - a.baseScore);

  // Top candidate depth search
  const topCandidates = scoredCandidates.slice(0, 15);

  for (const candidate of topCandidates) {
    const { r, c } = candidate;

    board[r][c] = aiPiece;
    const score = minimax(board, size, 2, -Infinity, Infinity, false, aiPiece, opponentPiece);
    board[r][c] = null;

    const totalScore = candidate.baseScore * 2 + score;

    if (totalScore > maxScore) {
      maxScore = totalScore;
      bestMove = [r, c];
    }
  }

  return bestMove;
};
