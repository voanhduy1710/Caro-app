import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CHAT_EMOTES, emoteSrc } from './chatEmotes';

interface BubblePlacement { left: number; bottom: number; width: number; arrowLeft: number; columns: number }

const MARGIN = 8;
const GAP = 10;
// A 28px picture in a button with 4px padding, 4px between buttons; the bubble
// has 8px side and 12px top and bottom padding plus a 1px border.
const CELL = 36;
const CELL_GAP = 4;
const PAD_X = 16 + 2;
const PAD_Y = 24 + 2;
const MIN_COLUMNS = 8;

/**
 * Every emoticon as its picture, in a bubble above the smiley button. The chat
 * panel clips what spills out of it, so the bubble is drawn on the page body
 * and placed from the button's position. Hovering one names it and shows the
 * shortcuts that type it.
 */
export const GameReactionPicker: React.FC<{
  open: boolean; isAiMode: boolean; anchorRef: React.RefObject<HTMLElement | null>;
  onPick: (code: string) => void; onClose: () => void;
}> = ({ open, isAiMode, anchorRef, onPick, onClose }) => {
  const visible = open && !isAiMode;
  const bubbleRef = useRef<HTMLDivElement>(null);
  const [placement, setPlacement] = useState<BubblePlacement | null>(null);

  useLayoutEffect(() => {
    if (!visible) { setPlacement(null); return; }
    const place = () => {
      const anchor = anchorRef.current;
      if (!anchor) return;
      const rect = anchor.getBoundingClientRect();
      // Never a scroller: when the room above the button is short, the grid
      // gets wider (fewer rows) until it fits, as far as the window allows.
      const roomAbove = rect.top - GAP - MARGIN;
      const widthFor = (columns: number) => columns * CELL + (columns - 1) * CELL_GAP + PAD_X;
      const heightFor = (columns: number) => {
        const rows = Math.ceil(CHAT_EMOTES.length / columns);
        return rows * CELL + (rows - 1) * CELL_GAP + PAD_Y;
      };
      const maxColumns = Math.max(MIN_COLUMNS, Math.floor((window.innerWidth - MARGIN * 2 - PAD_X + CELL_GAP) / (CELL + CELL_GAP)));
      let columns = MIN_COLUMNS;
      while (columns < maxColumns && heightFor(columns) > roomAbove) columns += 1;
      const width = Math.min(widthFor(columns), window.innerWidth - MARGIN * 2);
      const left = Math.min(Math.max(rect.left, MARGIN), window.innerWidth - width - MARGIN);
      setPlacement({
        left,
        width,
        columns,
        bottom: window.innerHeight - rect.top + GAP,
        arrowLeft: Math.min(Math.max(rect.left + rect.width / 2 - left, 16), width - 16),
      });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [visible, anchorRef]);

  useEffect(() => {
    if (!visible) return;
    // Capture phase, so Escape closes only the bubble and not the chat sheet behind it.
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopImmediatePropagation();
      onClose();
    };
    // The button toggles itself, so a press on it must not also count as "outside".
    const onPress = (event: MouseEvent) => {
      const target = event.target as Node;
      if (bubbleRef.current?.contains(target) || anchorRef.current?.contains(target)) return;
      onClose();
    };
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('mousedown', onPress, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('mousedown', onPress, true);
    };
  }, [visible, onClose, anchorRef]);

  if (!visible || !placement) return null;
  return createPortal(
    <div
      ref={bubbleRef}
      role="dialog"
      aria-label="Emoticons"
      style={{ left: placement.left, bottom: placement.bottom, width: placement.width }}
      className="fixed z-[70] rounded-sm border border-line-strong bg-surface px-2 py-3 shadow-e2 animate-pop-in"
    >
      <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${placement.columns}, minmax(0, 1fr))` }}>
        {CHAT_EMOTES.map((emote) => (
          <button
            key={emote.file}
            type="button"
            // Keeps the caret in the chat box, so the pick lands where the person was typing.
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onPick(emote.codes[0])}
            title={`${emote.label}  ${emote.codes.join('  ')}`}
            aria-label={`${emote.label}, shortcut ${emote.codes.join(' or ')}`}
            className="flex items-center justify-center rounded-sm p-1 transition-transform hover:scale-110 hover:bg-surface-2 active:scale-95"
          >
            <img src={emoteSrc(emote)} alt="" draggable={false} className="h-7 w-7 object-contain" />
          </button>
        ))}
      </div>
      {/* The bubble's tail, pointing down at the button. */}
      <span
        aria-hidden="true"
        style={{ left: placement.arrowLeft }}
        className="pointer-events-none absolute -bottom-[7px] h-3 w-3 -translate-x-1/2 rotate-45 border-b border-r border-line-strong bg-surface"
      />
    </div>,
    document.body,
  );
};
