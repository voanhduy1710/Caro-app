import { useCallback } from 'react';

/**
 * Web Audio API synthesized sound generator for zero-latency, zero-asset audio effects.
 */
export const useSound = () => {
  const playTone = useCallback((freq: number, type: OscillatorType, duration: number, startVol = 0.1) => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = type;
      osc.frequency.setValueAtTime(freq, ctx.currentTime);

      gain.gain.setValueAtTime(startVol, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + duration);
    } catch (e) {
      console.warn('Audio play error:', e);
    }
  }, []);

  const playMoveSound = useCallback(() => {
    playTone(600, 'sine', 0.08, 0.15);
  }, [playTone]);

  const playWinSound = useCallback(() => {
    // Fanfare sequence
    playTone(523.25, 'triangle', 0.2, 0.2); // C5
    setTimeout(() => playTone(659.25, 'triangle', 0.2, 0.2), 150); // E5
    setTimeout(() => playTone(783.99, 'triangle', 0.4, 0.25), 300); // G5
  }, [playTone]);

  const playTimerWarningSound = useCallback(() => {
    playTone(880, 'square', 0.1, 0.05);
  }, [playTone]);

  const playClickSound = useCallback(() => {
    playTone(400, 'sine', 0.05, 0.05);
  }, [playTone]);

  const playBuzzSound = useCallback(() => {
    try {
      const audio = new Audio('/quick-ting.mp3');
      audio.currentTime = 0;
      audio.play().catch(() => {
        // Fallback synthesis if audio play fails
        playTone(1200, 'sine', 0.15, 0.25);
        setTimeout(() => playTone(1500, 'sine', 0.2, 0.25), 120);
      });
    } catch {
      playTone(1200, 'sine', 0.15, 0.25);
      setTimeout(() => playTone(1500, 'sine', 0.2, 0.25), 120);
    }
  }, [playTone]);

  return {
    playMoveSound,
    playWinSound,
    playTimerWarningSound,
    playClickSound,
    playBuzzSound,
  };
};
