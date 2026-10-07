import { useMemo } from 'react';
import { useSound } from '../../../shared/hooks/useSound';
import { isSheetReportShowing } from '../disguiseMode';

/**
 * The game's sounds, silenced while the boss key has a fake report on screen.
 * A buzz, a tease, a win jingle or the five-second warning playing over a
 * finance sheet would give the cover away just as surely as the board would.
 * The check runs when the sound would play, not when the hook rendered, so a
 * sound fired from a stale callback still respects the current view.
 */
export const useSheetAwareSound = () => {
  const { playMoveSound, playWinSound, playTimerWarningSound, playClickSound, playBuzzSound, playChatSound } =
    useSound();
  return useMemo(() => {
    const gate = (play: () => void) => () => {
      if (!isSheetReportShowing()) play();
    };
    return {
      playMoveSound: gate(playMoveSound),
      playWinSound: gate(playWinSound),
      playTimerWarningSound: gate(playTimerWarningSound),
      playClickSound: gate(playClickSound),
      playBuzzSound: gate(playBuzzSound),
      playChatSound: gate(playChatSound),
    };
  }, [playMoveSound, playWinSound, playTimerWarningSound, playClickSound, playBuzzSound, playChatSound]);
};
