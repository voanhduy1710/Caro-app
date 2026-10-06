import React from 'react';

/** Text shortcut that chat draws as an image, picture lives in public/emojis. */
export interface ChatEmote {
  codes: string[];
  file: string;
  label: string;
}

export const CHAT_EMOTES: ChatEmote[] = [
  { codes: [':)', ':-)'], file: '1.gif', label: 'Happy' },
  { codes: [':(', ':-('], file: '2.gif', label: 'Sad' },
  { codes: [';)', ';-)'], file: '3.gif', label: 'Winking' },
  { codes: ['xD', ':D', ':-D'], file: '4.gif', label: 'Big grin' },
  { codes: [';;)'], file: '5.gif', label: 'Batting eyelashes' },
  { codes: ['>:D<'], file: '6.gif', label: 'Big hug' },
  { codes: [':-/', ':-\\'], file: '7.gif', label: 'Confused' },
  { codes: [':x', ':-x'], file: '8.gif', label: 'Love struck' },
  { codes: [':">'], file: '9.gif', label: 'Blushing' },
  { codes: [':P', ':-P'], file: '10.gif', label: 'Tongue out' },
  { codes: [':-*', ':*'], file: '11.gif', label: 'Kiss' },
  { codes: ['=(('], file: '12.gif', label: 'Broken heart' },
  { codes: [':-O', ':-o', ':O'], file: '13.gif', label: 'Surprise' },
  { codes: ['X('], file: '14.gif', label: 'Angry' },
  { codes: [':>', ':->'], file: '15.gif', label: 'Smug' },
  { codes: ['B-)'], file: '16.gif', label: 'Cool' },
  { codes: [':-S'], file: '17.gif', label: 'Worried' },
  { codes: [':#-S', '#-S'], file: '18.gif', label: 'Whew!' },
  { codes: ['>:)'], file: '19.gif', label: 'Devil' },
  { codes: [':((', ':-(('], file: '20.gif', label: 'Crying' },
  { codes: [':))'], file: '21.gif', label: 'Laughing' },
  { codes: [':|', ':-|'], file: '22.gif', label: 'Straight face' },
  { codes: ['/:)'], file: '23.gif', label: 'Raised eyebrow' },
  { codes: ['=))'], file: '24.gif', label: 'Rolling on the floor' },
  { codes: ['O:-)', '0:-)'], file: '25.gif', label: 'Angel' },
  { codes: [':-B'], file: '26.gif', label: 'Nerd' },
  { codes: ['=;'], file: '27.gif', label: 'Talk to the hand' },
  { codes: [':-c'], file: '28.gif', label: 'Call me' },
  { codes: [':)]'], file: '29.gif', label: 'On the phone' },
  { codes: ['~X('], file: '30.gif', label: 'At wits\' end' },
  { codes: [':-h'], file: '31.gif', label: 'Wave' },
  { codes: [':-t'], file: '32.gif', label: 'Time out' },
  { codes: ['8->'], file: '33.gif', label: 'Daydreaming' },
  { codes: ['I-)'], file: '34.gif', label: 'Sleepy' },
  { codes: ['8-|'], file: '35.gif', label: 'Rolling eyes' },
  { codes: ['L-)'], file: '36.gif', label: 'Loser' },
  { codes: [':-&'], file: '37.gif', label: 'Sick' },
  { codes: [':-$'], file: '38.gif', label: 'Don\'t tell anyone' },
  { codes: ['[-('], file: '39.gif', label: 'Not talking' },
  { codes: [':O)'], file: '40.gif', label: 'Clown' },
  { codes: ['8-}'], file: '41.gif', label: 'Silly' },
  { codes: ['<:-P'], file: '42.gif', label: 'Party' },
  { codes: ['(:|', '(:I'], file: '43.gif', label: 'Yawn' },
  { codes: ['=P~'], file: '44.gif', label: 'Drooling' },
  { codes: [':-?'], file: '45.gif', label: 'Thinking' },
  { codes: ['#-o'], file: '46.gif', label: 'D\'oh!' },
  { codes: ['=D>'], file: '47.gif', label: 'Applause' },
  { codes: [':-SS', ':ss'], file: '48.gif', label: 'Nail biting' },
  { codes: ['@-)'], file: '49.gif', label: 'Hypnotized' },
  { codes: [':^o'], file: '50.gif', label: 'Liar' },
  { codes: [':-w'], file: '51.gif', label: 'Waiting' },
  { codes: [':-<'], file: '52.gif', label: 'Sigh' },
  { codes: ['>:P'], file: '53.gif', label: 'Phbbbbt' },
  { codes: ['<):)'], file: '54.gif', label: 'Cowboy' },
  { codes: ['X_X'], file: '55.gif', label: 'I don\'t want to see' },
  { codes: [':!!'], file: '56.gif', label: 'Hurry up' },
  { codes: ['\\m/'], file: '57.gif', label: 'Rock on' },
  { codes: [':-q'], file: '58.gif', label: 'Thumbs down' },
  { codes: [':-bd'], file: '59.gif', label: 'Thumbs up' },
  { codes: ['^#(^'], file: '60.gif', label: 'It wasn\'t me' },
  { codes: [':ar!'], file: 'pirate_2.gif', label: 'Pirate' },
  { codes: [':v'], file: 'pacman.png', label: 'Pac-man' },
];

export const emoteSrc = (emote: ChatEmote) => `${import.meta.env.BASE_URL}emojis/${emote.file}`;

const byCode = new Map<string, ChatEmote>();
CHAT_EMOTES.forEach((emote) => emote.codes.forEach((code) => byCode.set(code.toLowerCase(), emote)));

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Longest first, so ":))" is never read as ":)" followed by a stray ")".
// The lookahead keeps ":D" from firing inside a word such as ":Dog".
const EMOTE_PATTERN = new RegExp(
  `(${[...byCode.keys()].sort((a, b) => b.length - a.length).map(escapeRegex).join('|')})(?![A-Za-z0-9])`,
  'gi',
);

const isAlnum = (char: string | undefined) => Boolean(char && /[A-Za-z0-9]/.test(char));

/** True when a longer shortcut starts with this one, e.g. ":)" while ":))" may still be typed. */
const hasLongerCode = (code: string) => {
  const lower = code.toLowerCase();
  for (const other of byCode.keys()) if (other.length > lower.length && other.startsWith(lower)) return true;
  return false;
};

export type EmotePart = string | { code: string; emote: ChatEmote };

/**
 * Splits text into plain runs and emotes. While someone is typing
 * (`holdTrailing`), a shortcut at the very end that could still grow into a
 * longer one, such as ":)" on the way to ":))", stays text until the next key.
 */
export const splitEmotes = (text: string, options: { holdTrailing?: boolean } = {}): EmotePart[] => {
  const parts: EmotePart[] = [];
  let last = 0;
  for (const match of text.matchAll(EMOTE_PATTERN)) {
    const code = match[1];
    const emote = byCode.get(code.toLowerCase());
    const index = match.index;
    if (!emote || index === undefined) continue;
    // "boxD" is a word, not a box with a grin.
    if (isAlnum(code[0]) && isAlnum(text[index - 1])) continue;
    if (options.holdTrailing && index + code.length === text.length && hasLongerCode(code)) continue;
    if (index > last) parts.push(text.slice(last, index));
    parts.push({ code, emote });
    last = index + code.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
};

/** Splits a message into text and emote images, so a shortcut mid-sentence turns into its picture. */
export const renderWithEmotes = (text: string): React.ReactNode[] =>
  splitEmotes(text).map((part, index) =>
    typeof part === 'string' ? (
      part
    ) : (
      <img
        key={index}
        src={emoteSrc(part.emote)}
        alt={part.code}
        title={`${part.emote.label} ${part.code}`}
        draggable={false}
        className="mx-0.5 inline-block h-5 w-5 select-none object-contain align-text-bottom"
      />
    ),
  );
