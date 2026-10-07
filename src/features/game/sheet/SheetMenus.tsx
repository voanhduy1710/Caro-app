import React, { useCallback, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, MoreHorizontal } from 'lucide-react';
import type { SheetMenuDef, SheetMenuItem } from './menuTypes';
import { useDismiss, type DismissReason } from './useDismiss';
import { CHROME_FONT, MENU_SHADOW } from './sheetStyle';

/**
 * Sheets-style dropdowns: the menu bar, and the single dropdown buttons in the
 * toolbar and the sheet-tab strip. Panels are portalled to the body and placed
 * from the trigger's measured position, because the toolbar scrolls sideways
 * (which clips anything absolutely positioned inside it) and the board's
 * ancestors may be transformed.
 */

const ITEM_SELECTOR = '[role="menuitem"]:not(:disabled), [role="menuitemcheckbox"]:not(:disabled)';

interface MenuPanelProps {
  items: SheetMenuItem[];
  /** Read in a layout effect, so the trigger is measured after it rendered. */
  getAnchor: () => HTMLElement | null;
  placement: 'below' | 'above';
  panelRef: React.RefObject<HTMLDivElement | null>;
  focusFirst: boolean;
  onClose: (restoreFocus: boolean) => void;
  /** Left/right arrow from inside a menu-bar menu moves to its neighbour. */
  onNeighbour?: (direction: 1 | -1) => void;
  labelledBy?: string;
  minWidth?: number;
}

const MenuPanel: React.FC<MenuPanelProps> = ({
  items,
  getAnchor,
  placement,
  panelRef,
  focusFirst,
  onClose,
  onNeighbour,
  labelledBy,
  minWidth = 220,
}) => {
  useLayoutEffect(() => {
    const panel = panelRef.current;
    const anchor = getAnchor();
    if (!panel || !anchor) return;
    const rect = anchor.getBoundingClientRect();
    const margin = 8;
    const width = panel.offsetWidth;
    const left = Math.max(margin, Math.min(rect.left, window.innerWidth - width - margin));
    panel.style.left = `${left}px`;
    if (placement === 'below') {
      const top = rect.bottom + 2;
      panel.style.top = `${top}px`;
      panel.style.maxHeight = `${Math.max(120, window.innerHeight - top - margin)}px`;
    } else {
      const available = Math.max(120, rect.top - 2 - margin);
      panel.style.maxHeight = `${available}px`;
      const height = Math.min(panel.scrollHeight, available);
      panel.style.top = `${Math.max(margin, rect.top - 2 - height)}px`;
    }
    panel.style.visibility = 'visible';
  }, [getAnchor, placement, panelRef, items]);

  // Separate from placement: the menus are rebuilt on every parent render
  // (the clocks tick once a second), and refocusing then would yank the
  // keyboard user back to the first item.
  useLayoutEffect(() => {
    if (focusFirst) panelRef.current?.querySelector<HTMLElement>(ITEM_SELECTOR)?.focus();
  }, [focusFirst, panelRef]);

  const moveFocus = (step: number | 'first' | 'last') => {
    const panel = panelRef.current;
    if (!panel) return;
    const enabled = Array.from(panel.querySelectorAll<HTMLElement>(ITEM_SELECTOR));
    if (!enabled.length) return;
    const current = enabled.indexOf(document.activeElement as HTMLElement);
    let next: number;
    if (step === 'first') next = 0;
    else if (step === 'last') next = enabled.length - 1;
    else if (current === -1) next = step > 0 ? 0 : enabled.length - 1;
    else next = (current + step + enabled.length) % enabled.length;
    enabled[next].focus();
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        moveFocus(1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        moveFocus(-1);
        break;
      case 'Home':
        event.preventDefault();
        moveFocus('first');
        break;
      case 'End':
        event.preventDefault();
        moveFocus('last');
        break;
      case 'ArrowLeft':
      case 'ArrowRight':
        if (onNeighbour) {
          event.preventDefault();
          onNeighbour(event.key === 'ArrowRight' ? 1 : -1);
        }
        break;
      case 'Tab':
        onClose(false);
        break;
      default:
        break;
    }
  };

  return createPortal(
    <div
      ref={panelRef}
      role="menu"
      aria-labelledby={labelledBy}
      onKeyDown={onKeyDown}
      className="fixed z-[1000] overflow-y-auto rounded bg-white py-1.5"
      style={{
        top: 0,
        left: 0,
        minWidth,
        maxWidth: 'min(380px, calc(100vw - 16px))',
        visibility: 'hidden',
        boxShadow: MENU_SHADOW,
        fontFamily: CHROME_FONT,
      }}
    >
      {items.map((item, index) => {
        if (item.kind === 'separator') {
          return <div key={`sep-${index}`} role="separator" className="my-1.5 h-px bg-[#e0e0e0]" />;
        }
        if (item.kind === 'header') {
          return (
            <div key={`head-${index}`} role="presentation" className="px-4 pt-1.5 pb-1 text-[12px] font-medium text-[#5f6368]">
              {item.label}
            </div>
          );
        }
        const isCheckbox = item.checked !== undefined;
        return (
          <button
            key={`${item.label}-${index}`}
            type="button"
            role={isCheckbox ? 'menuitemcheckbox' : 'menuitem'}
            aria-checked={isCheckbox ? item.checked : undefined}
            aria-label={item.ariaLabel}
            title={item.title}
            disabled={item.disabled}
            tabIndex={-1}
            onClick={() => {
              onClose(true);
              item.onSelect();
            }}
            className="relative flex h-8 w-full items-center pr-4 pl-10 text-left text-[14px] whitespace-nowrap text-[#202124] outline-none hover:bg-[#f1f3f4] focus:bg-[#e8eaed] disabled:cursor-default disabled:text-[#80868b] disabled:hover:bg-transparent"
          >
            {item.checked && <Check size={18} strokeWidth={2.2} className="absolute left-3 text-[#202124]" aria-hidden="true" />}
            <span className="min-w-0 flex-1 truncate">{item.label}</span>
            {item.shortcut && <span className="ml-8 shrink-0 text-[12px] text-[#5f6368]">{item.shortcut}</span>}
          </button>
        );
      })}
    </div>,
    document.body,
  );
};

/* -------------------------------- menu bar -------------------------------- */

const MORE_ID = '__more';

/** One menu-bar button's box; the invisible measuring copies share it. */
const MENU_BUTTON =
  'inline-flex h-6 shrink-0 items-center rounded px-[7px] text-[14px] leading-none whitespace-nowrap text-[#202124] outline-none focus-visible:ring-2 focus-visible:ring-[#0b57d0] focus-visible:ring-inset';

/** Tệp, Chỉnh sửa, Xem… — click to open, hover to move between open menus. */
export const SheetMenuBar: React.FC<{ menus: SheetMenuDef[] }> = ({ menus }) => {
  const [open, setOpen] = useState<{ id: string; focusFirst: boolean } | null>(null);
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const barRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const baseId = useId();

  const close = useCallback(
    (restoreFocus: boolean) => {
      if (open && restoreFocus) buttons.current.get(open.id)?.focus();
      setOpen(null);
    },
    [open],
  );

  useDismiss(Boolean(open), (reason: DismissReason) => close(reason === 'escape'), [barRef, panelRef]);

  // As many menus as fit stay on the bar; the rest fold into one "more" menu.
  // Measured rather than tied to a breakpoint, because the room the bar gets
  // depends on more than the window: the comments panel, the side strip and
  // the right-hand buttons all take from it, and menus that did not fit used
  // to spill under the Share pill.
  const measureRef = useRef<HTMLDivElement>(null);
  const [visibleCount, setVisibleCount] = useState(menus.length);
  const labelsKey = menus.map((menu) => menu.label).join('|');
  useLayoutEffect(() => {
    const bar = barRef.current;
    const measure = measureRef.current;
    if (!bar || !measure) return;
    const fit = () => {
      const widths = Array.from(measure.children, (child) => (child as HTMLElement).offsetWidth);
      const moreWidth = widths.pop() ?? 0;
      const available = bar.clientWidth;
      let total = widths.reduce((sum, width) => sum + width, 0);
      let count = widths.length;
      if (total > available) {
        total = moreWidth;
        count = 0;
        while (count < widths.length && total + widths[count] <= available) {
          total += widths[count];
          count += 1;
        }
      }
      setVisibleCount((current) => (current === count ? current : count));
    };
    fit();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(fit);
    observer.observe(bar);
    return () => observer.disconnect();
  }, [labelsKey]);

  const shownMenus = menus.slice(0, visibleCount);
  // The folded menus, captioned with each menu's name so the items keep their
  // context.
  const overflowItems: SheetMenuItem[] = menus
    .slice(visibleCount)
    .flatMap((menu, i) => [
      ...(i > 0 ? [{ kind: 'separator' } as const] : []),
      { kind: 'header', label: menu.label } as const,
      ...menu.items,
    ]);

  const visibleIds = () =>
    [...shownMenus.map((menu) => menu.id), MORE_ID].filter((id) => buttons.current.has(id));

  const neighbour = (direction: 1 | -1) => {
    if (!open) return;
    const ids = visibleIds();
    const index = ids.indexOf(open.id);
    if (index === -1) return;
    const next = ids[(index + direction + ids.length) % ids.length];
    setOpen({ id: next, focusFirst: true });
  };

  const openMenu: SheetMenuDef | null = !open
    ? null
    : open.id === MORE_ID
      ? { id: MORE_ID, label: 'Thêm', items: overflowItems }
      : shownMenus.find((menu) => menu.id === open.id) ?? null;

  const getAnchor = useCallback(() => (open ? buttons.current.get(open.id) ?? null : null), [open]);

  const renderButton = (id: string, label: React.ReactNode, ariaLabel?: string) => {
    const isOpen = open?.id === id;
    return (
      <button
        key={id}
        id={`${baseId}-${id}`}
        ref={(el) => {
          if (el) buttons.current.set(id, el);
          else buttons.current.delete(id);
        }}
        type="button"
        role="menuitem"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label={ariaLabel}
        onClick={() => setOpen(isOpen ? null : { id, focusFirst: false })}
        onMouseEnter={() => {
          if (open && !isOpen) setOpen({ id, focusFirst: false });
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            setOpen({ id, focusFirst: true });
          } else if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
            event.preventDefault();
            const ids = visibleIds();
            const index = ids.indexOf(id);
            const next = ids[(index + (event.key === 'ArrowRight' ? 1 : -1) + ids.length) % ids.length];
            buttons.current.get(next)?.focus();
          }
        }}
        className={`${MENU_BUTTON} ${
          isOpen ? 'bg-[#e8eaed]' : 'hover:bg-[#f1f3f4]'
        }`}
      >
        {label}
      </button>
    );
  };

  return (
    <div
      ref={barRef}
      role="menubar"
      aria-label="Thanh trình đơn"
      className="relative -ml-[7px] flex min-w-0 items-center overflow-hidden"
    >
      {/* Invisible copies of every menu button and of the "more" button,
          there only so each one's natural width can be read. */}
      <div ref={measureRef} aria-hidden="true" className="pointer-events-none invisible absolute top-0 left-0 flex">
        {menus.map((menu) => (
          <span key={menu.id} className={MENU_BUTTON}>
            {menu.label}
          </span>
        ))}
        <span className={MENU_BUTTON}>
          <MoreHorizontal size={16} />
        </span>
      </div>
      {shownMenus.map((menu) => renderButton(menu.id, menu.label))}
      {overflowItems.length > 0 &&
        renderButton(MORE_ID, <MoreHorizontal size={16} aria-hidden="true" />, 'Thêm trình đơn')}
      {open && openMenu && (
        <MenuPanel
          key={openMenu.id}
          items={openMenu.items}
          getAnchor={getAnchor}
          placement="below"
          panelRef={panelRef}
          focusFirst={open.focusFirst}
          onClose={close}
          onNeighbour={neighbour}
          labelledBy={`${baseId}-${openMenu.id}`}
        />
      )}
    </div>
  );
};

/* ----------------------------- dropdown button ---------------------------- */

interface SheetDropdownButtonProps {
  items: SheetMenuItem[];
  /** Pure Sheets wording, for the tooltip a bystander might see. */
  title?: string;
  ariaLabel: string;
  className: string;
  /** Classes while the menu is open; defaults to the toolbar's pressed look. */
  openClassName?: string;
  placement?: 'below' | 'above';
  minWidth?: number;
  children: React.ReactNode;
  onDoubleClick?: () => void;
  /** Runs on every click, before the menu decides whether to open. */
  onPress?: () => void;
  /**
   * Whether a click opens the menu. Sheet tabs pass a test so only their
   * caret opens it, while a click on the name just selects the tab.
   */
  opensOnPress?: boolean | ((event: React.MouseEvent<HTMLButtonElement>) => boolean);
}

/** One toolbar or tab-strip button with its own dropdown. */
export const SheetDropdownButton: React.FC<SheetDropdownButtonProps> = ({
  items,
  title,
  ariaLabel,
  className,
  openClassName = 'bg-[#d3e3fd]! text-[#041e49]!',
  placement = 'below',
  minWidth,
  children,
  onDoubleClick,
  onPress,
  opensOnPress = true,
}) => {
  const [open, setOpen] = useState<{ focusFirst: boolean } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const id = useId();

  const close = useCallback((restoreFocus: boolean) => {
    setOpen(null);
    if (restoreFocus) buttonRef.current?.focus();
  }, []);

  useDismiss(Boolean(open), (reason: DismissReason) => close(reason === 'escape'), [buttonRef, panelRef]);

  const getAnchor = useCallback(() => buttonRef.current, []);

  return (
    <>
      <button
        ref={buttonRef}
        id={id}
        type="button"
        title={title}
        aria-label={ariaLabel}
        aria-haspopup="menu"
        aria-expanded={Boolean(open)}
        onClick={(event) => {
          onPress?.();
          const opens = typeof opensOnPress === 'function' ? opensOnPress(event) : opensOnPress;
          if (opens) setOpen(open ? null : { focusFirst: false });
        }}
        onDoubleClick={onDoubleClick}
        onKeyDown={(event) => {
          // Keyboard users always reach the menu with the down arrow, even on
          // a tab whose click only selects it.
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            setOpen({ focusFirst: true });
          }
        }}
        className={`${className} ${open ? openClassName : ''}`}
      >
        {children}
      </button>
      {open && (
        <MenuPanel
          items={items}
          getAnchor={getAnchor}
          placement={placement}
          panelRef={panelRef}
          focusFirst={open.focusFirst}
          onClose={close}
          labelledBy={id}
          minWidth={minWidth}
        />
      )}
    </>
  );
};
