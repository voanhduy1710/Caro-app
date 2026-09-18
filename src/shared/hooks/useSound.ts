import { useCallback, useEffect } from 'react';
import { getDisplayPrefs } from '../../features/game/displayPrefs';

/** One context avoids browser limits and retains the user-gesture unlock. */
let sharedAudioContext: AudioContext | null = null;

const audioContext = (): AudioContext | null => {
  if (typeof window === 'undefined') return null;
  if (sharedAudioContext?.state === 'closed') sharedAudioContext = null;
  if (sharedAudioContext) return sharedAudioContext;
  const AudioCtx = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return null;
  sharedAudioContext = new AudioCtx();
  return sharedAudioContext;
};

/** Resume inside a user gesture, so later network-delivered sounds can play. */
const unlockAudio = () => {
  const ctx = audioContext();
  if (ctx?.state === 'suspended' || ctx?.state === 'interrupted') {
    void ctx.resume().catch(() => {
      // The next interaction gets another chance; audio is never a blocker.
    });
  }
};

/** Web Audio effects with one browser-unlocked context for the whole app. */
export const useSound = () => {
  useEffect(() => {
    // Pointer down precedes a board or Buzz click, unlocking audio before the
    // accepted room event comes back from the network.
    window.addEventListener('pointerdown', unlockAudio, { capture: true });
    window.addEventListener('keydown', unlockAudio, { capture: true });
    return () => {
      window.removeEventListener('pointerdown', unlockAudio, { capture: true });
      window.removeEventListener('keydown', unlockAudio, { capture: true });
    };
  }, []);

  const playTone = useCallback((freq: number, type: OscillatorType, duration: number, startVol = 0.1) => {
    if (!getDisplayPrefs().soundEnabled) return;
    try {
      const ctx = audioContext();
      if (!ctx) return;
      if (ctx.state !== 'running') unlockAudio();
      const startAt = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, startAt);
      gain.gain.setValueAtTime(startVol, startAt);
      gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(startAt);
      osc.stop(startAt + duration);
    } catch (error) {
      console.warn('Audio play error:', error);
    }
  }, []);

  const playMoveSound = useCallback(() => playTone(600, 'sine', 0.08, 0.15), [playTone]);
  const playWinSound = useCallback(() => {
    playTone(523.25, 'triangle', 0.2, 0.2);
    window.setTimeout(() => playTone(659.25, 'triangle', 0.2, 0.2), 150);
    window.setTimeout(() => playTone(783.99, 'triangle', 0.4, 0.25), 300);
  }, [playTone]);
  const playTimerWarningSound = useCallback(() => playTone(880, 'square', 0.1, 0.05), [playTone]);
  const playClickSound = useCallback(() => playTone(400, 'sine', 0.05, 0.05), [playTone]);
  const playBuzzSound = useCallback(() => {
    playTone(1200, 'sine', 0.15, 0.25);
    window.setTimeout(() => playTone(1500, 'sine', 0.2, 0.25), 120);
  }, [playTone]);
  // Softer and lower than Buzz: a chat note should inform, not nudge.
  const playChatSound = useCallback(() => {
    playTone(660, 'triangle', 0.07, 0.09);
    window.setTimeout(() => playTone(880, 'triangle', 0.11, 0.08), 70);
  }, [playTone]);

  return { playMoveSound, playWinSound, playTimerWarningSound, playClickSound, playBuzzSound, playChatSound };
};
