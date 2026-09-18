import React from 'react';

type CoinFace = 'X' | 'O';

interface CoinTossModalProps {
  hostName: string;
  isHost: boolean;
  call: CoinFace | null;
  face: CoinFace | null;
  winnerName?: string;
  onCall?: (face: CoinFace) => void;
}

export const CoinFaceArt: React.FC<{ face: CoinFace }> = ({ face }) => (
  <img
    src={face === 'X' ? '/assets/minigames/coin_x.png' : '/assets/minigames/coin_o.png'}
    alt={`Coin face ${face}`}
    className="minigame-coin__art"
    draggable={false}
  />
);

export const CoinTossModal: React.FC<CoinTossModalProps> = ({ hostName, isHost, call, face, onCall }) => {
  const isFlipping = face !== null;

  return (
    <div className="minigame-overlay coin-game" role="status" aria-live="assertive">
      <div className="minigame-chamber coin-game__chamber">
        <div className="minigame-chamber__bolts" aria-hidden="true" />
        <h2 className="minigame-title">Golden Coin Flip</h2>

        {/* Both users see which coin the host selected to see who wins */}
        {call ? (
          <p className="minigame-copy minigame-copy--call">
            Host has selected <strong className="text-accent font-bold">Side {call}</strong> to see who wins
          </p>
        ) : (
          <p className="minigame-copy">
            {isHost ? 'Select X or O to see who wins' : `${hostName} is selecting a coin...`}
          </p>
        )}

        {!isFlipping ? (
          <div className="coin-game__calls">
            {(['X', 'O'] as const).map((side) => (
              <button
                key={side}
                type="button"
                disabled={!isHost || call !== null}
                onClick={() => onCall?.(side)}
                className={`coin-call ${call === side ? 'coin-call--selected' : ''}`}
              >
                <div className="coin-call__preview">
                  <CoinFaceArt face={side} />
                </div>
                <span>Side {side}</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="coin-game__flight" aria-label={`Coin landed on ${face}`}>
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
            <span className="coin-game__spark coin-game__spark--one" />
            <span className="coin-game__spark coin-game__spark--two" />
          </div>
        )}
      </div>
    </div>
  );
};

