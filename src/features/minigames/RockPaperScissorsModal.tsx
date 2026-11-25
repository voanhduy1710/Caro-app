import React from 'react';
import { useT } from '../i18n/language';
import { useIsOrca } from '../theme/uiStyle';
import { RockPaperScissorsModalOrca } from './RockPaperScissorsModal.orca';

type Hand = 'rock' | 'paper' | 'scissors';

export interface RockPaperScissorsModalProps {
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
  /** A repeat of the marquee: still clickable, but out of the tab order and the accessibility tree. */
  decorative?: boolean;
  onClick?: () => void;
}> = ({ hand, selected = false, hidden = false, decorative = false, onClick }) => {
  const t = useT();
  const src = hidden ? SLAB_IMAGES.eye : hand ? SLAB_IMAGES[hand] : SLAB_IMAGES.eye;

  return (
    <button
      type="button"
      disabled={!onClick}
      onClick={onClick}
      aria-hidden={decorative || undefined}
      tabIndex={decorative ? -1 : undefined}
      className={`stone-slab ${selected ? 'stone-slab--selected' : ''} ${hidden ? 'stone-slab--hidden' : ''}`}
    >
      <img
        src={src}
        alt={hidden ? t('game.minigame.opponentHidden') : hand ? t('game.minigame.stone', { hand: t(`game.minigame.${hand}`) }) : ''}
        className="stone-slab__img"
        draggable={false}
      />
      {selected && <span className="stone-slab__flame" aria-hidden="true" />}
    </button>
  );
};

const RockPaperScissorsModalDefault: React.FC<RockPaperScissorsModalProps> = ({
  myChoice,
  choices,
  isPlayer,
  winnerName,
  onChoose,
}) => {
  const t = useT();
  const resolved = choices.X && choices.O;

  if (resolved) {
    const xHand = choices.X as Hand;
    const oHand = choices.O as Hand;

    return (
      <div className="minigame-overlay rps-game" role="status" aria-live="assertive">
        <div className="rps-clash">
          <div className="rps-clash__doors rps-clash__doors--left" />
          <div className="rps-clash__doors rps-clash__doors--right" />
          <h2 className="minigame-title">{t('game.minigame.clash')}</h2>
          <div className="rps-clash__hands">
            <div className="rps-clash__hand rps-clash__hand--top">
              <img src={SLAB_IMAGES[oHand]} alt={t(`game.minigame.${oHand}`)} className="rps-clash__img rps-clash__img--top" draggable={false} />
            </div>
            <span className="rps-clash__impact" aria-hidden="true" />
            <div className="rps-clash__hand rps-clash__hand--bottom">
              <img src={SLAB_IMAGES[xHand]} alt={t(`game.minigame.${xHand}`)} className="rps-clash__img" draggable={false} />
            </div>
          </div>
          <p className="minigame-copy">
            {winnerName ? t('game.minigame.clashWinner', { name: winnerName }) : t('game.minigame.clashTie')}
          </p>
        </div>
      </div>
    );
  }

  // Generates repeating sequences for a truly seamless infinite marquee without gaps
  const opponentSlabs = Array.from({ length: 16 }, (_, idx) => idx);
  const playerHands = [...HANDS, ...HANDS, ...HANDS, ...HANDS, ...HANDS];

  return (
    <div className="minigame-overlay rps-game" role="dialog" aria-modal="true" aria-label={t('game.minigame.rpsLabel')}>
      <div className="rps-conveyor">
        <h2 className="minigame-title">{t('game.minigame.chooseHand')}</h2>

        {/* Opponent rail with infinite scrolling Millennium Eye slabs */}
        <div className="rps-rail rps-rail--opponent" aria-label={t('game.minigame.opponentChoicesHidden')}>
          <div className="rps-rail__track">
            {opponentSlabs.map((index) => (
              <StoneSlab key={`opp-${index}`} hidden decorative={index > 0} />
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
                decorative={index >= HANDS.length}
                selected={myChoice === hand.id}
                onClick={isPlayer && !myChoice ? () => onChoose?.(hand.id) : undefined}
              />
            ))}
          </div>
        </div>

        <p className="minigame-copy">
          {myChoice
            ? t('game.minigame.locked')
            : isPlayer
            ? null
            : t('game.minigame.choosing')}
        </p>
      </div>
    </div>
  );
};

export const RockPaperScissorsModal: React.FC<RockPaperScissorsModalProps> = (props) =>
  useIsOrca() ? <RockPaperScissorsModalOrca {...props} /> : <RockPaperScissorsModalDefault {...props} />;
