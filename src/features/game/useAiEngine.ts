import { useCallback, useEffect, useRef } from 'react';
import { getBestAiMove } from './aiEngine';
import type { BoardMatrix } from '../../shared/utils/gomokuLogic';
import type { AiRequest, AiResponse } from './aiEngine.worker';

/**
 * Asks the AI for a move on a worker thread, falling back to a direct call when
 * workers are unavailable. Only the newest request is ever answered, so an undo
 * or a rematch cannot be overtaken by a stale search.
 */
export const useAiEngine = () => {
  const workerRef = useRef<Worker | null>(null);
  const requestIdRef = useRef(0);
  const pendingRef = useRef<Map<number, (move: [number, number]) => void>>(new Map());

  useEffect(() => {
    let worker: Worker | null = null;
    try {
      worker = new Worker(new URL('./aiEngine.worker.ts', import.meta.url), { type: 'module' });
      worker.onmessage = (event: MessageEvent<AiResponse>) => {
        const { id, move } = event.data;
        const resolve = pendingRef.current.get(id);
        pendingRef.current.delete(id);
        if (resolve) resolve(move);
      };
      worker.onerror = (err) => {
        console.warn('AI worker failed, falling back to the main thread:', err.message);
        workerRef.current = null;
      };
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
  const requestMove = useCallback((board: BoardMatrix, size: number, aiPiece: 'X' | 'O') => {
    const worker = workerRef.current;
    if (!worker) {
      return Promise.resolve(getBestAiMove(board, size, aiPiece));
    }

    // Abandon every earlier search: only the latest board matters.
    pendingRef.current.clear();

    const id = ++requestIdRef.current;
    return new Promise<[number, number]>((resolve) => {
      pendingRef.current.set(id, resolve);
      const request: AiRequest = { id, board, size, aiPiece };
      worker.postMessage(request);
    });
  }, []);

  const cancelPending = useCallback(() => {
    pendingRef.current.clear();
  }, []);

  return { requestMove, cancelPending };
};
