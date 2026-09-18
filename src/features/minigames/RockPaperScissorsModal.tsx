import React from 'react';

type Hand = 'rock' | 'paper' | 'scissors';

interface RockPaperScissorsModalProps {
  myChoice: Hand | null;
  choices: { X: Hand | null; O: Hand | null };
  isPlayer: boolean;
  winnerName?: string;
  onChoose?: (choice: Hand) => void;
}

const HANDS: Array<{ id: Hand }> = [
  { id: 'paper' },
  { id: 'rock' },
  { id: 'scissors' },
];

const SLAB_IMAGES: Record<Hand | 'eye', string> = {
  paper: '/assets/minigames/slab_paper.png',
  rock: '/assets/minigames/slab_rock.png',
  scissors: '/assets/minigames/slab_scissors.png',
  eye: '/assets/minigames/slab_eye.png',
};

const StoneSlab: React.FC<{
  hand?: Hand;
  selected?: boolean;
  hidden?: boolean;
  onClick?: () => void;
}> = ({ hand, selected = false, hidden = false, onClick }) => {
  const src = hidden ? SLAB_IMAGES.eye : hand ? SLAB_IMAGES[hand] : SLAB_IMAGES.eye;

  return (
    <button
      type="button"
      disabled={!onClick}
      onClick={onClick}
      className={`stone-slab ${selected ? 'stone-slab--selected' : ''} ${hidden ? 'stone-slab--hidden' : ''}`}
    >
      <img
        src={src}
        alt={hidden ? 'Opponent hidden stone' : `${hand} stone`}
        className="stone-slab__img"
        draggable={false}
      />
      {selected && <span className="stone-slab__flame" aria-hidden="true" />}
    </button>
  );
};

export const RockPaperScissorsModal: React.FC<RockPaperScissorsModalProps> = ({
  myChoice,
  choices,
  isPlayer,
  winnerName,
  onChoose,
}) => {
  const resolved = choices.X && choices.O;

  if (resolved) {
    const xHand = choices.X as Hand;
    const oHand = choices.O as Hand;

    return (
      <div className="minigame-overlay rps-game" role="status" aria-live="assertive">
        <div className="rps-clash">
          <div className="rps-clash__doors rps-clash__doors--left" />
          <div className="rps-clash__doors rps-clash__doors--right" />
          <h2 className="minigame-title">Clash!</h2>
          <div className="rps-clash__hands">
            <div className="rps-clash__hand rps-clash__hand--top">
              <img src={SLAB_IMAGES[oHand]} alt={oHand} className="rps-clash__img rps-clash__img--top" draggable={false} />
            </div>
            <span className="rps-clash__impact" aria-hidden="true" />
            <div className="rps-clash__hand rps-clash__hand--bottom">
              <img src={SLAB_IMAGES[xHand]} alt={xHand} className="rps-clash__img" draggable={false} />
            </div>
          </div>
          <p className="minigame-copy">
            {winnerName ? `${winnerName} wins the clash and moves first.` : 'A tie — choose again.'}
          </p>
        </div>
      </div>
    );
  }

  // Generates repeating sequences for a truly seamless infinite marquee without gaps
  const opponentSlabs = Array.from({ length: 16 }, (_, idx) => idx);
  const playerHands = [...HANDS, ...HANDS, ...HANDS, ...HANDS, ...HANDS];

  return (
    <div className="minigame-overlay rps-game" role="dialog" aria-modal="true" aria-label="Rock paper scissors">
      <div className="rps-conveyor">
        <h2 className="minigame-title">Choose your hand</h2>

        {/* Opponent rail with infinite scrolling Millennium Eye slabs */}
        <div className="rps-rail rps-rail--opponent" aria-label="Opponent choices hidden">
          <div className="rps-rail__track">
            {opponentSlabs.map((index) => (
              <StoneSlab key={`opp-${index}`} hidden />
            ))}
          </div>
        </div>

        {/* Player rail with infinite scrolling hand slabs */}
        <div className="rps-rail rps-rail--player">
          <div className="rps-rail__track">
            {playerHands.map((hand, index) => (
              <StoneSlab
                key={`${hand.id}-${index}`}
                hand={hand.id}
                selected={myChoice === hand.id}
                onClick={isPlayer && !myChoice ? () => onChoose?.(hand.id) : undefined}
              />
            ))}
          </div>
        </div>

        <p className="minigame-copy">
          {myChoice
            ? 'Your stone is locked. Waiting for the other duelist…'
            : isPlayer
            ? null
            : 'The duelists are choosing their hands…'}
        </p>
      </div>
    </div>
  );
};


