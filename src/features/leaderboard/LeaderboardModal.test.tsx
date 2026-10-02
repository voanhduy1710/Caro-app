import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { LeaderboardModal } from './LeaderboardModal';
import { RankGuideModal } from './RankGuideModal';

describe('LeaderboardModal', () => {
  it('offers a rank guide from the leaderboard header', () => {
    const html = renderToStaticMarkup(<LeaderboardModal isOpen onClose={() => {}} />);
    expect(html).toContain('Rank guide');
  });

  it('shows all badge images with the Elo ranges used by rank matching', () => {
    const html = renderToStaticMarkup(<RankGuideModal isOpen onClose={() => {}} />);
    expect(html.match(/src="\/badges\/[^"]+\.webp"/g)).toHaveLength(10);
    expect(html).toContain('Grand Master');
    expect(html).toContain('2100+ Elo');
    expect(html).toContain('1900–2099 Elo');
    expect(html).toContain('Below 1000 Elo');
    expect(html).toContain('/badges/stone.webp');
  });

  it('offers a preview button for each badge', () => {
    const html = renderToStaticMarkup(<RankGuideModal isOpen onClose={() => {}} />);
    expect(html).toContain('aria-label="View Grand Master badge"');
    expect(html).toContain('aria-label="View Stone badge"');
  });
});
