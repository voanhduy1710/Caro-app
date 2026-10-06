import React, { useLayoutEffect, useRef } from 'react';
import { emoteSrc, splitEmotes, type EmotePart } from './chatEmotes';

const EMOTE_IMG_CLASS = 'mx-0.5 inline-block h-5 w-5 select-none object-contain align-text-bottom';

/** Browsers without "plaintext-only" fall back to plain editing; the serialiser copes with its extra markup. */
const EDIT_MODE: 'plaintext-only' | true = (() => {
  if (typeof document === 'undefined') return true;
  try {
    const probe = document.createElement('div');
    probe.contentEditable = 'plaintext-only';
    return probe.contentEditable === 'plaintext-only' ? 'plaintext-only' : true;
  } catch {
    return true;
  }
})();

/** The plain text a node tree stands for: emote images count as the shortcut that made them. */
const serialize = (parent: Node): string => {
  let out = '';
  parent.childNodes.forEach((node, index) => {
    if (node.nodeType === Node.TEXT_NODE) out += node.textContent ?? '';
    else if (node instanceof HTMLImageElement) out += node.dataset.code ?? node.alt;
    else if (node instanceof HTMLBRElement) out += '\n';
    else if (node instanceof HTMLElement) out += (index > 0 ? '\n' : '') + serialize(node);
  });
  return out;
};

const toNodes = (parts: EmotePart[]): Node[] =>
  parts.map((part) => {
    if (typeof part === 'string') return document.createTextNode(part);
    const img = document.createElement('img');
    img.src = emoteSrc(part.emote);
    img.alt = part.code;
    img.title = `${part.emote.label} ${part.code}`;
    img.draggable = false;
    img.contentEditable = 'false';
    img.dataset.code = part.code;
    img.className = EMOTE_IMG_CLASS;
    return img;
  });

const partsSignature = (parts: EmotePart[]) =>
  parts.map((part) => (typeof part === 'string' ? `T${part}` : `E${part.code}`)).join('\u0000');

/** Same shape as partsSignature, read off the live DOM; anything unexpected never matches. */
const domSignature = (el: HTMLElement) => {
  const items: string[] = [];
  let lastIsText = false;
  for (const node of Array.from(el.childNodes)) {
    let text: string | null = null;
    if (node.nodeType === Node.TEXT_NODE) text = node.textContent ?? '';
    else if (node instanceof HTMLBRElement) text = '\n';
    if (text !== null) {
      if (!text) continue;
      if (lastIsText) items[items.length - 1] += text;
      else items.push(`T${text}`);
      lastIsText = true;
    } else if (node instanceof HTMLImageElement && node.dataset.code) {
      items.push(`E${node.dataset.code}`);
      lastIsText = false;
    } else {
      return '?';
    }
  }
  return items.join('\u0000');
};

const setCaret = (el: HTMLElement, offset: number) => {
  const selection = window.getSelection();
  if (!selection) return;
  const range = document.createRange();
  let remaining = offset;
  let placed = false;
  const children = Array.from(el.childNodes);
  for (let i = 0; i < children.length && !placed; i += 1) {
    const node = children[i];
    if (node.nodeType === Node.TEXT_NODE) {
      const length = node.textContent?.length ?? 0;
      if (remaining <= length) {
        range.setStart(node, remaining);
        placed = true;
      } else remaining -= length;
    } else if (node instanceof HTMLImageElement) {
      const length = node.dataset.code?.length ?? 0;
      if (remaining <= length) {
        range.setStart(el, remaining === 0 ? i : i + 1);
        placed = true;
      } else remaining -= length;
    }
  }
  if (!placed) {
    range.selectNodeContents(el);
    range.collapse(false);
  } else range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
};

export interface EmoteInputProps {
  value: string;
  onChange: (value: string) => void;
  inputRef: React.RefObject<HTMLDivElement | null>;
  placeholder: string;
  className?: string;
  title?: string;
  'aria-label'?: string;
  onKeyDown?: React.KeyboardEventHandler<HTMLDivElement>;
  onPaste?: React.ClipboardEventHandler<HTMLDivElement>;
}

/**
 * A chat box that draws emote shortcuts as their pictures while the person is
 * still typing. A textarea cannot hold images, so this is a small
 * contenteditable whose value is still the plain text: `=))` in, `=))` out.
 */
export const EmoteInput: React.FC<EmoteInputProps> = ({ value, onChange, inputRef, placeholder, className, title, onKeyDown, onPaste, ...rest }) => {
  const lastText = useRef('');
  const composing = useRef(false);

  const sync = () => {
    const el = inputRef.current;
    if (!el) return;
    const hasImage = el.querySelector('img') !== null;
    const text = !hasImage && !el.textContent ? '' : serialize(el);
    const parts = splitEmotes(text, { holdTrailing: true });
    if (domSignature(el) !== partsSignature(parts)) {
      const selection = window.getSelection();
      let caret: number | null = null;
      if (selection && selection.rangeCount && selection.anchorNode && el.contains(selection.anchorNode)) {
        const range = document.createRange();
        range.selectNodeContents(el);
        range.setEnd(selection.anchorNode, selection.anchorOffset);
        caret = serialize(range.cloneContents()).length;
      }
      el.replaceChildren(...toNodes(parts));
      if (caret !== null) setCaret(el, caret);
    }
    if (text !== lastText.current) {
      lastText.current = text;
      onChange(text);
    }
  };

  // The parent clears or replaces the draft (after sending, say): redraw it.
  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el || value === lastText.current) return;
    lastText.current = value;
    el.replaceChildren(...toNodes(splitEmotes(value)));
  }, [value, inputRef]);

  return (
    <div
      ref={inputRef}
      role="textbox"
      aria-multiline="true"
      aria-label={rest['aria-label']}
      title={title}
      data-placeholder={placeholder}
      contentEditable={EDIT_MODE}
      suppressContentEditableWarning
      spellCheck
      onInput={() => {
        // Mid-composition (Vietnamese Telex, IME) the browser owns the text.
        if (!composing.current) sync();
      }}
      onCompositionStart={() => { composing.current = true; }}
      onCompositionEnd={() => { composing.current = false; sync(); }}
      onKeyDown={onKeyDown}
      onPaste={(event) => {
        onPaste?.(event);
        if (event.defaultPrevented) return;
        // Pasted rich text would smuggle markup into the box; take the text only.
        const text = event.clipboardData.getData('text/plain');
        if (!text) return;
        event.preventDefault();
        document.execCommand('insertText', false, text);
      }}
      className={`${className ?? ''} whitespace-pre-wrap break-words empty:before:pointer-events-none empty:before:text-subtle empty:before:content-[attr(data-placeholder)]`}
    />
  );
};
