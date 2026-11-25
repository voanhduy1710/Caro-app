import React from 'react';
import { useT } from '../i18n/language';
import { useIsOrca } from '../theme/uiStyle';
import { CoinTossModalOrca } from './CoinTossModal.orca';

type CoinFace = 'X' | 'O';

export interface CoinTossModalProps {
  chooserName: string;
  canCall: boolean;
  call: CoinFace | null;
  face: CoinFace | null;
  callerName?: string;
  winnerName?: string;
  onCall?: (face: CoinFace) => void;
}

const CoinFaceArt: React.FC<{ face: CoinFace }> = ({ face }) => {
  const t = useT();
  return (
    <img
      src={face === 'X' ? '/assets/minigames/coin_x.png' : '/assets/minigames/coin_o.png'}
      alt={t('game.minigame.coinFace', { face })}
      className="minigame-coin__art"
      draggable={false}
    />
  );
};

const CoinTossModalDefault: React.FC<CoinTossModalProps> = ({ chooserName, canCall, call, face, callerName, onCall }) => {
  const t = useT();
  const isFlipping = face !== null;
  const choseCorrectly = call !== null && face !== null && call === face;

  return (
    <div className="minigame-overlay coin-game" role="status" aria-live="assertive">
      <div className="minigame-chamber coin-game__chamber">
        <div className="minigame-chamber__bolts" aria-hidden="true" />
        <h2 className="minigame-title coin-game__choice-title">
          {call ? (
            <>
              <span>{t('game.minigame.chose', { name: callerName ?? chooserName })}</span>
              <span className="coin-game__choice-icon"><CoinFaceArt face={call} /></span>
            </>
          ) : t('game.minigame.chooserChooses', { name: chooserName })}
        </h2>

        {!isFlipping ? (
          <div className="coin-game__calls">
            {(['X', 'O'] as const).map((side) => (
              <button
                key={side}
                type="button"
                disabled={!canCall || call !== null}
                onClick={() => onCall?.(side)}
                className={`coin-call ${call === side ? 'coin-call--selected' : ''}`}
              >
                <div className="coin-call__preview">
                  <CoinFaceArt face={side} />
                </div>
                <span>{t('game.minigame.side', { side })}</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="coin-game__flight" aria-label={t('game.minigame.coinLanded', { face })}>
              <div className={`minigame-coin minigame-coin--land-${face}`}>
                <div className="minigame-coin__body">
                  <div className="minigame-coin__face minigame-coin__face--front">
                    <img src="/assets/minigames/coin_x.png" alt="X" className="minigame-coin__art" draggable={false} />
                  </div>
                  <div className="minigame-coin__face minigame-coin__face--back">
                    <img src="/assets/minigames/coin_o.png" alt="O" className="minigame-coin__art" draggable={false} />
                  </div>
                  <div className="minigame-coin__rim" aria-hidden="true" />
                </div>
              </div>
              <span className="coin-game__shadow" aria-hidden="true" />
              {choseCorrectly && (
                <>
                  <span className="coin-game__gleam" aria-hidden="true" />
                  <span className="coin-game__spark coin-game__spark--one" />
                  <span className="coin-game__spark coin-game__spark--two" />
                </>
              )}
          </div>
        )}
      </div>
    </div>
  );
};

export const CoinTossModal: React.FC<CoinTossModalProps> = (props) =>
  useIsOrca() ? <CoinTossModalOrca {...props} /> : <CoinTossModalDefault {...props} />;
