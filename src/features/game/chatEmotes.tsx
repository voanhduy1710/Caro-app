import React from 'react';

/** Text shortcut that chat draws as an image, picture lives in public/emojis. */
export interface ChatEmote {
  codes: string[];
  file: string;
  label: string;
}

export const CHAT_EMOTES: ChatEmote[] = [
  { codes: [':D'], file: '1.gif', label: 'Big grin' },
  { codes: [':>'], file: '2.gif', label: 'Smug' },
  { codes: [':P'], file: '3.gif', label: 'Tongue out' },
  { codes: [':-SS'], file: '4.gif', label: 'Nervous' },
  { codes: [':((', ':('], file: '5.gif', label: 'Crying' },
  { codes: [':))'], file: '6.gif', label: 'Laughing' },
  { codes: [':|'], file: '7.gif', label: 'Deadpan' },
  { codes: ['=))'], file: '8.gif', label: 'Rolling on the floor' },
  { codes: [':v'], file: 'pacman.png', label: 'Pac-man' },
  { codes: [':)'], file: 'smile.webp', label: 'Smile' },
  { codes: [':smirk:', ':>:'], file: 'smirk.webp', label: 'Smirk' },
  { codes: [':grin:'], file: 'grin.webp', label: 'Grin' },
  { codes: [':laugh:', ':lol:'], file: 'laugh.webp', label: 'Laugh' },
  { codes: ['<3', ':heart:'], file: 'heart.webp', label: 'Heart' },
  { codes: [':fire:'], file: 'fire.webp', label: 'Fire' },
  { codes: ['(y)', ':+1:'], file: 'thumbs_up.webp', label: 'Thumbs up' },
];

const emotePath = (file: string) => `${import.meta.env.BASE_URL}emojis/${file}`;

const byCode = new Map<string, ChatEmote>();
CHAT_EMOTES.forEach((emote) => emote.codes.forEach((code) => byCode.set(code.toLowerCase(), emote)));

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Longest first, so ":))" is never read as ":)" followed by a stray ")".
// The lookahead keeps ":D" from firing inside a word such as ":Dog".
const EMOTE_PATTERN = new RegExp(
  `(${[...byCode.keys()].sort((a, b) => b.length - a.length).map(escapeRegex).join('|')})(?![A-Za-z0-9])`,
  'gi',
);

/** Splits a message into text and emote images, so a shortcut mid-sentence turns into its picture. */
export const renderWithEmotes = (text: string): React.ReactNode[] => {
  const nodes: React.ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(EMOTE_PATTERN)) {
    const emote = byCode.get(match[1].toLowerCase());
    if (!emote || match.index === undefined) continue;
    if (match.index > last) nodes.push(text.slice(last, match.index));
    nodes.push(
      <img
        key={`${match.index}`}
        src={emotePath(emote.file)}
        alt={match[1]}
        title={`${emote.label} ${match[1]}`}
        draggable={false}
        className="mx-0.5 inline-block h-5 w-5 select-none object-contain align-text-bottom"
      />,
    );
    last = match.index + match[1].length;
  }
  if (last === 0) return [text];
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
};
