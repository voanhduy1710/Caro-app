import React from 'react';
import { useT } from '../../features/i18n/language';
import { getRankTitle } from '../utils/rankTiers';
import { useIsOrca } from '../../features/theme/uiStyle';

interface RankBadgeProps {
  elo: number;
  size?: number;
  className?: string;
}

export const RankBadge: React.FC<RankBadgeProps> = ({ elo, size = 24, className = '' }) => {
  const t = useT();
  const isOrca = useIsOrca();
  const rank = getRankTitle(elo);
  return (
    <img
      src={rank.badge}
      alt={t('game.rankBadgeAlt', { title: rank.title })}
      title={rank.title}
      width={size}
      height={size}
      loading="lazy"
      draggable={false}
      className={`${isOrca ? 'inline-block select-none ' : ''}shrink-0 object-contain ${className}`.trim()}
      style={{ width: size, height: size }}
    />
  );
};
