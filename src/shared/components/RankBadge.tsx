import React from 'react';
import { getRankTitle } from '../utils/eloCalculator';

interface RankBadgeProps {
  elo: number;
  size?: number;
  className?: string;
}

export const RankBadge: React.FC<RankBadgeProps> = ({ elo, size = 24, className = '' }) => {
  const rank = getRankTitle(elo);
  return (
    <img
      src={rank.badge}
      alt={`${rank.title} rank`}
      title={rank.title}
      width={size}
      height={size}
      loading="lazy"
      draggable={false}
      className={`shrink-0 object-contain ${className}`}
      style={{ width: size, height: size }}
    />
  );
};
