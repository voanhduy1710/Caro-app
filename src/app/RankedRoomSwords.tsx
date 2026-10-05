import React from 'react';

export const RankedRoomSwords: React.FC<{ side: 'left' | 'right' }> = ({ side }) => (
  <img
    src="/assets/ranked-swords-thin.png"
    className={`btn-ranked__swords btn-ranked__swords--${side}`}
    alt=""
    aria-hidden="true"
    draggable={false}
  />
);
