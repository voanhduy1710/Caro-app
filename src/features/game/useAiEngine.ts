import { useCallback, useEffect, useRef } from 'react';
import { getBestAiMove } from './aiEngine';
import type { BoardMatrix } from '../../shared/utils/gomokuLogic';
import type { AiRequest, AiResponse } from './aiEngine.worker';

interface PendingRequest {
  resolve: (move: [number, number]) => void;
  reject: (reason: unknown) => void;
  board: BoardMatrix;
  size: number;
  aiPiece: 'X' | 'O';
  timeLimitMs?: number;
}

/**
 * Asks the AI for a move on a worker thread, falling back to a direct call when
 * workers are unavailable. Only the newest request is ever answered, so an undo
 * or a rematch cannot be overtaken by a stale search.
 */
export const useAiEngine = () => {
  const workerRef = useRef<Worker | null>(null);
  const requestIdRef = useRef(0);
  const pendingRef = useRef<Map<number, PendingRequest>>(new Map());

  useEffect(() => {
    let worker: Worker | null = null;
    try {
      worker = new Worker(new URL('./aiEngine.worker.ts', import.meta.url), { type: 'module' });
      worker.onmessage = (event: MessageEvent<AiResponse>) => {
        const { id, move } = event.data;
        const request = pendingRef.current.get(id);
        pendingRef.current.delete(id);
        if (request) request.resolve(move);
      };
      // A dead worker never answers, so a search in flight would leave the bot
      // "thinking" forever. Settle it on the main thread, as the no-worker path does.
      const failWorker = (reason: string) => {
        console.warn('AI worker failed, falling back to the main thread:', reason);
        const dying = worker;
        if (!dying || workerRef.current !== dying) return;
        workerRef.current = null;
        dying.terminate();
        const stranded = [...pendingRef.current.values()];
        pendingRef.current.clear();
        for (const { resolve, reject, board, size, aiPiece, timeLimitMs } of stranded) {
          try {
            resolve(getBestAiMove(board, size, aiPiece, { timeLimitMs }));
          } catch (err) {
            reject(err);
          }
        }
      };
      worker.onerror = (err) => failWorker(err.message);
      worker.onmessageerror = () => failWorker('unreadable message from the worker');
      workerRef.current = worker;
    } catch (err) {
      console.warn('AI worker unavailable, using the main thread:', err);
      workerRef.current = null;
    }

    const pending = pendingRef.current;
    return () => {
      pending.clear();
      worker?.terminate();
      workerRef.current = null;
    };
  }, []);

  /** Resolves with the chosen move, or never resolves if a newer request wins. */
  const requestMove = useCallback((board: BoardMatrix, size: number, aiPiece: 'X' | 'O', timeLimitMs?: number) => {
    const worker = workerRef.current;
    if (!worker) {
      return Promise.resolve(getBestAiMove(board, size, aiPiece, { timeLimitMs }));
    }

    // Abandon every earlier search: only the latest board matters.
    pendingRef.current.clear();

    const id = ++requestIdRef.current;
    return new Promise<[number, number]>((resolve, reject) => {
      pendingRef.current.set(id, { resolve, reject, board, size, aiPiece, timeLimitMs });
      const request: AiRequest = { id, board, size, aiPiece, timeLimitMs };
      worker.postMessage(request);
    });
  }, []);

  const cancelPending = useCallback(() => {
    pendingRef.current.clear();
  }, []);

  return { requestMove, cancelPending };
};
