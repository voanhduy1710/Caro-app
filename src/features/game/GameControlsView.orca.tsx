import React from 'react';
import { ArrowLeft, ChevronUp, Flame, MessageSquare, PanelRightOpen, Settings2, SlidersHorizontal, Timer, Users } from 'lucide-react';
import type { UserProfile } from '../auth/AuthContext';
import { getAvatarPublicUrl } from '../avatar/avatarService';
import type { useT } from '../i18n/language';
import { pieceColor } from '../theme/types';
import type { ThemeSettings } from '../theme/types';
import { formatReconnectDuration } from '../../shared/utils/formatDuration';
import { Badge, Button, IconButton } from '../../shared/ui/primitives';
import { cn } from '../../shared/ui/cn';
import { GameActionRailOrca, PrefsPopover } from './GameActionRail.orca';
import type { GameActionRailProps } from './GameActionRail';
import { GameChatHeader } from './GameChatHeader';
import { formatElapsed } from './GameControlsShared';
import type { GameControlsProps } from './GameControlsShared';
import type { MatchHeaderProps, SeatView } from './MatchHeader';
import { OPEN_SETTINGS_EVENT } from './sheetBridge';
import { SheetComments } from './SheetComments';
import { SheetSideStrip } from './SheetSideStrip';

/**
 * Everything GameControls has worked out that the Orca layout draws. All the
 * state and hooks stay in GameControls (one component for both styles), so
 * switching style keeps the same tree and never remounts the board.
 */
export interface GameControlsOrcaContext {
  t: ReturnType<typeof useT>;
  theme: ThemeSettings;
  layout: 'sheet' | 'solo' | 'desktop' | 'mobile';
  props: GameControlsProps;
  rail: GameActionRailProps;
  canBuzz: boolean;
  handleBuzzClick: () => void;
  isBuzzCooldown: boolean;
  isChatOpen: boolean;
  setIsChatOpen: React.Dispatch<React.SetStateAction<boolean>>;
  closeChatSheet: () => void;
  chatBarRef: React.RefObject<HTMLButtonElement | null>;
  sheetRef: React.RefObject<HTMLDivElement | null>;
  trapSheetFocus: (event: React.KeyboardEvent<HTMLDivElement>) => void;
  unreadCount: number;
  lastMessagePreview: string;
  chatFeed: React.ReactNode;
  composer: React.ReactNode;
  lightbox: React.ReactNode;
  commentsOpen: boolean;
  setLightboxImage: (image: string | null) => void;
  isMobileRosterOpen: boolean;
  setIsMobileRosterOpen: React.Dispatch<React.SetStateAction<boolean>>;
  rosterBtnRef: React.RefObject<HTMLButtonElement | null>;
  rosterPopoverRef: React.RefObject<HTMLDivElement | null>;
}

/** The board size, read from `<Board size>` or its immediate wrapper. */
const boardSizeOf = (node: React.ReactNode): number | null => {
  if (!React.isValidElement(node)) return null;
  const props = node.props as { size?: unknown; children?: React.ReactNode };
  if (typeof props.size === 'number') return props.size;
  if (React.isValidElement(props.children)) {
    const childProps = props.children.props as { size?: unknown };
    if (typeof childProps.size === 'number') return childProps.size;
  }
  return null;
};

/** The MatchHeader's own props, so the phone strips can draw its seats directly. */
const headerPropsOf = (node: React.ReactNode): MatchHeaderProps | null => {
  if (!React.isValidElement(node)) return null;
  const props = node.props as Partial<MatchHeaderProps>;
  if (!Array.isArray(props.seats) || !Array.isArray(props.score)) return null;
  return props as MatchHeaderProps;
};

const unreadBadge = (count: number) =>
  count > 0 ? (
    <span className="rounded-[4px] bg-danger-solid px-1.5 py-0.5 font-mono text-[10px] font-semibold leading-none text-danger-fg tabular-nums">
      {count > 99 ? '99+' : count}
    </span>
  ) : null;

/**
 * PR 5's match stage. Four layouts share ONE root `<div>`, and the board's
 * slot is always its child 1 with `boardNode` as that slot's child 1, exactly
 * as in the Default layout: the style switch, Ctrl+Q, the chat toggle and the
 * 1024px breakpoint never unmount the board.
 *
 * - desktop / solo: 248px match sidebar (back, rules, match meta, seat cards,
 *   roster, actions) | board stage | 310px chat column (rooms; collapsible).
 * - mobile: opponent strip with back | edge-to-edge board | self strip with
 *   the icon actions | chat pill opening an 80dvh focus-trapped sheet.
 * - sheet: the Spreadsheet disguise, as in the Default style.
 */
export const renderGameControlsOrca = (c: GameControlsOrcaContext): React.ReactElement => {
  const { t, theme, layout, props: p, rail } = c;
  const { headerNode, boardNode, rosterNode, playerTimers = [], isAiMode, exitLabel, onExitMatch, moveCount = 0, elapsedGameTime = 0, doubleDown, role = 'player' } = p;
  const exitTitle = `${exitLabel} — ${isAiMode ? t('game.exitHomeTitle') : t('game.exitRoomTitle')}`;
  const openRules = () => window.dispatchEvent(new Event(OPEN_SETTINGS_EVENT));
  const colorOf = (piece: 'X' | 'O' | 'T') => pieceColor(theme, piece);
  const header = headerPropsOf(headerNode);
  const timerSecondsFor = (seat: SeatView): number | null => {
    if (seat.clock > 0) return seat.clock;
    const timer = playerTimers.find((item) => item.piece === seat.piece);
    return timer ? timer.seconds : null;
  };
  const badgeStyle = (seat: SeatView): React.CSSProperties => {
    const color = colorOf(seat.piece);
    return seat.isTurn && !seat.empty
      ? { backgroundColor: `${color}28`, color, borderColor: `${color}70` }
      : { backgroundColor: `${color}14`, color, borderColor: `${color}3d` };
  };
  const seatBox = (seat: SeatView) =>
    seat.empty ? 'border-dashed border-line-strong bg-surface/50' : seat.isTurn ? 'border-line-strong bg-surface-2/85' : 'border-line bg-surface';
  const avatarFallback = (e: React.SyntheticEvent<HTMLImageElement>) => {
    e.currentTarget.onerror = null;
    e.currentTarget.src = getAvatarPublicUrl();
  };
  const openChatLabel =
    c.unreadCount > 0
      ? t(c.unreadCount === 1 ? 'game.openChatUnreadOne' : 'game.openChatUnreadMany', { count: c.unreadCount })
      : t('game.openChat');

  const rootClassName =
    layout === 'sheet'
      ? 'sheet-shell fixed inset-0 z-[45] flex bg-white'
      : layout === 'mobile'
      ? 'flex h-[100dvh] max-h-full min-h-0 w-full flex-1 flex-col overflow-hidden bg-editor'
      : 'flex h-[calc(100dvh-36px)] max-h-full min-h-0 w-full flex-1 flex-row overflow-hidden bg-editor';
  const boardStageClassName =
    layout === 'sheet'
      ? 'flex min-h-0 min-w-0 flex-1 flex-col *:min-h-0 *:items-stretch'
      : cn(
          'relative flex min-h-0 min-w-0 flex-1 flex-col items-center justify-center overflow-hidden bg-editor [&>*:last-child]:min-h-0 [&>*:last-child]:w-full [&>*:last-child]:justify-center [&_.board-frame]:max-h-full',
          layout === 'mobile' ? 'px-1 py-1' : 'p-2',
        );

  /* ------------------------------ slot 0 ------------------------------ */

  let slot0: React.ReactNode = null;
  if (layout === 'mobile') {
    const opponents = header ? header.seats.slice(1) : [];
    const compactTwo = opponents.length > 1;
    slot0 = (
      <header className="flex h-11 shrink-0 items-center justify-between gap-1.5 border-b border-line bg-sidebar px-2">
        <IconButton size="md" onClick={onExitMatch} title={exitTitle} aria-label={exitLabel}>
          <ArrowLeft size={16} strokeWidth={1.75} aria-hidden="true" />
        </IconButton>

        {header ? (
          <div className={cn('min-w-0 flex-1', compactTwo ? 'grid grid-cols-2 gap-1' : 'flex items-center')}>
            {opponents.map((opp, idx) => {
              const seconds = timerSecondsFor(opp);
              const awaySeconds = opp.reconnectingSeconds;
              const away = awaySeconds !== null && awaySeconds !== undefined;
              const urgent = opp.moveClock > 0 && opp.moveClock <= 5;
              return (
                <button
                  key={`${opp.piece}-${idx}`}
                  type="button"
                  onClick={opp.onClick}
                  disabled={!opp.onClick}
                  title={opp.title}
                  className={cn(
                    'flex min-w-0 items-center gap-1.5 rounded-[6px] border px-1.5 py-0.5 text-left transition-colors',
                    !compactTwo && 'w-full',
                    seatBox(opp),
                  )}
                >
                  <span className="grid h-4 w-4 shrink-0 place-items-center rounded-[4px] border font-mono text-[10px] font-semibold leading-none" style={badgeStyle(opp)}>
                    {opp.piece === 'T' ? '△' : opp.piece}
                  </span>
                  {!opp.empty && (
                    <img
                      src={getAvatarPublicUrl(opp.photoURL)}
                      alt=""
                      aria-hidden="true"
                      onError={avatarFallback}
                      className={cn(
                        'h-6 w-6 shrink-0 rounded-full border border-line bg-surface-2 object-contain p-0.5',
                        compactTwo && 'hidden h-5 w-5 min-[360px]:block',
                        away && 'opacity-45 grayscale',
                      )}
                    />
                  )}
                  <span className="min-w-0 flex-1 truncate text-xs font-medium text-ink">
                    {opp.bubble ? `${opp.name} · "${opp.bubble}"` : opp.name}
                  </span>
                  <span className="flex shrink-0 items-center gap-1 font-mono text-[11px] font-semibold tabular-nums">
                    {away ? (
                      <span className="text-warning">{formatReconnectDuration(awaySeconds)}</span>
                    ) : (
                      <>
                        {opp.moveClock > 0 && (
                          <span
                            className={cn(
                              'rounded-[4px] px-1 py-0.5 text-[10.5px] leading-none',
                              urgent ? 'animate-pulse bg-danger-solid text-danger-fg' : 'bg-accent-soft text-accent-text',
                            )}
                          >
                            {opp.moveClock}s
                          </span>
                        )}
                        {seconds !== null && (!compactTwo || opp.moveClock <= 0) && (
                          <span className={opp.isTurn ? 'text-ink' : 'text-muted'}>{formatElapsed(seconds)}</span>
                        )}
                      </>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="min-w-0 flex-1 overflow-hidden">{headerNode}</div>
        )}

        <div className="flex shrink-0 items-center gap-0.5">
          {header && (
            <span className="inline-flex items-center gap-1 rounded-[5px] border border-line bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-ink tabular-nums">
              {doubleDown?.active && <Flame size={11} strokeWidth={2} className="text-warning" aria-hidden="true" />}
              <span aria-hidden="true">{header.score.map((value) => value ?? 0).join('–')}</span>
              <span className="sr-only">{header.scoreLabel}</span>
            </span>
          )}

          {rosterNode && (
            <div className="relative">
              <IconButton
                ref={c.rosterBtnRef}
                size="sm"
                active={c.isMobileRosterOpen}
                onClick={() => c.setIsMobileRosterOpen((open) => !open)}
                aria-haspopup="dialog"
                aria-expanded={c.isMobileRosterOpen}
                title={t('common.members')}
                aria-label={t('common.members')}
              >
                <Users size={14} strokeWidth={1.75} aria-hidden="true" />
              </IconButton>
              {c.isMobileRosterOpen && (
                <div
                  ref={c.rosterPopoverRef}
                  role="dialog"
                  aria-label={t('common.members')}
                  className="scrollbar-orca absolute right-0 top-full z-50 mt-1.5 max-h-[65dvh] w-72 overflow-y-auto rounded-[8px] border border-line-strong bg-surface p-1.5 shadow-e2 [&>section]:mx-0 [&>section]:mb-0 [&>section]:border-0"
                >
                  {rosterNode}
                </div>
              )}
            </div>
          )}

          <div className="relative">
            <IconButton
              ref={rail.gearRef}
              size="sm"
              active={rail.isPrefsOpen}
              onClick={() => rail.setIsPrefsOpen((open) => !open)}
              aria-haspopup="dialog"
              aria-expanded={rail.isPrefsOpen}
              title={t('game.displayAndSound')}
              aria-label={t('game.displayAndSound')}
            >
              <Settings2 size={14} strokeWidth={1.75} aria-hidden="true" />
            </IconButton>
            {rail.isPrefsOpen && <PrefsPopover prefsRef={rail.prefsRef} prefs={rail.prefs} className="right-0 top-full z-50 mt-1.5" />}
          </div>

          <IconButton size="sm" onClick={openRules} title={t('room.changeRules')} aria-label={t('room.changeRules')}>
            <SlidersHorizontal size={14} strokeWidth={1.75} aria-hidden="true" />
          </IconButton>
        </div>

        {header && (
          <p aria-live="polite" className="sr-only">
            {header.announcement}
          </p>
        )}
      </header>
    );
  } else if (layout !== 'sheet') {
    const boardSize = boardSizeOf(boardNode);
    // The seat cards take the timers, the users and the buzz from here.
    const desktopHeader =
      header && React.isValidElement<MatchHeaderProps>(headerNode)
        ? React.cloneElement(headerNode, {
            playerTimers,
            myUser: p.myUser as UserProfile | null,
            opponent: p.opponent,
            isAiMode,
            role,
            onNudgeOpponent: c.canBuzz ? c.handleBuzzClick : undefined,
            nudgeDisabled: c.isBuzzCooldown,
          })
        : headerNode;
    slot0 = (
      <aside className="scrollbar-orca flex w-[248px] shrink-0 flex-col justify-between gap-3 overflow-y-auto border-r border-line bg-sidebar p-3">
        <div className="flex flex-col gap-2.5">
          <div className="flex items-center justify-between gap-1.5">
            <Button variant="ghost" size="sm" onClick={onExitMatch} title={exitTitle} className="-ml-1.5 justify-start px-2 text-xs text-muted hover:text-ink">
              <ArrowLeft size={14} strokeWidth={1.75} aria-hidden="true" />
              <span className="truncate">{exitLabel}</span>
            </Button>
            <IconButton size="sm" onClick={openRules} title={t('room.changeRules')} aria-label={t('room.changeRules')}>
              <SlidersHorizontal size={14} strokeWidth={1.75} aria-hidden="true" />
            </IconButton>
          </div>

          <div
            className="flex flex-wrap items-center justify-between gap-1.5 rounded-[6px] border border-line bg-surface px-2.5 py-1.5 font-mono text-[11px] text-muted tabular-nums"
            title={t('game.movesElapsed', { count: moveCount })}
          >
            <div className="flex items-center gap-1.5">
              {boardSize !== null && (
                <>
                  <span className="font-semibold text-ink">
                    {boardSize}×{boardSize}
                  </span>
                  <span aria-hidden="true" className="text-subtle">·</span>
                </>
              )}
              <span>
                {moveCount} {moveCount === 1 ? t('game.moveOne') : t('game.moveMany')}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              {doubleDown?.active && (
                <Badge tone="warning" className="px-1.5 py-0 text-[10px]">
                  <Flame size={11} strokeWidth={1.75} aria-hidden="true" />
                  <span>{t('game.doubleDownOn')}</span>
                </Badge>
              )}
              <span className="inline-flex items-center gap-1 font-semibold text-ink">
                <Timer size={12} strokeWidth={1.75} className="text-muted" aria-hidden="true" />
                <span>{formatElapsed(elapsedGameTime)}</span>
              </span>
            </div>
          </div>

          {desktopHeader}

          {rosterNode && <div className="[&>section]:mx-0 [&>section]:mb-0">{rosterNode}</div>}
        </div>

        <GameActionRailOrca {...rail} variant="sidebar" />
      </aside>
    );
  }

  /* ------------------------------ slot 1 ------------------------------ */

  const chatCollapsed = !c.isChatOpen;
  const boardStage = (
    <div className={boardStageClassName}>
      {layout === 'desktop' && chatCollapsed ? (
        <div className="absolute right-3 top-3 z-20">
          <button
            type="button"
            onClick={() => c.setIsChatOpen(true)}
            aria-label={openChatLabel}
            title={t('game.openChat')}
            className="inline-flex h-8 items-center gap-1.5 rounded-[6px] border border-line-strong bg-surface/95 px-2.5 text-xs font-medium text-ink shadow-e1 backdrop-blur-sm transition-colors hover:bg-surface-2"
          >
            <PanelRightOpen size={14} strokeWidth={1.75} className="text-muted" aria-hidden="true" />
            <span>{t('game.chat')}</span>
            {unreadBadge(c.unreadCount)}
          </button>
        </div>
      ) : null}
      {boardNode}
    </div>
  );

  /* ------------------------------ slot 2+ ----------------------------- */

  const header0 = header?.seats[0] ?? null;
  const botFirstAction = isAiMode && moveCount === 0 ? header?.seats.slice(1).find((seat) => seat.action)?.action : undefined;
  const chatHeader = (
    <GameChatHeader
      open={c.isChatOpen}
      unreadCount={c.unreadCount}
      messageCount={p.chatMessages.length}
      preview={c.lastMessagePreview}
      onToggle={layout === 'mobile' ? c.closeChatSheet : () => c.setIsChatOpen((open) => !open)}
    />
  );

  return (
    <div className={rootClassName}>
      {slot0}
      {boardStage}

      {layout === 'sheet' ? (
        <>
          {c.commentsOpen && <SheetComments onOpenImage={c.setLightboxImage} />}
          <SheetSideStrip />
        </>
      ) : null}

      {layout === 'desktop' && !chatCollapsed ? (
        <aside className="flex min-h-0 w-[310px] shrink-0 flex-col overflow-hidden border-l border-line bg-sidebar">
          <div className="shrink-0 border-b border-line">{chatHeader}</div>
          <div id="chat-panel-body" className="flex min-h-0 flex-1 flex-col px-3 pt-2">
            {c.chatFeed}
          </div>
          <div className="flex shrink-0 flex-col justify-center border-t border-line px-3 py-2">{c.composer}</div>
        </aside>
      ) : null}

      {layout === 'mobile' ? (
        <>
          <div className="flex h-11 shrink-0 items-center justify-between gap-1.5 border-t border-line bg-sidebar px-2">
            <div className="flex min-w-0 items-center gap-1.5">
              {header0 && (
                <button
                  type="button"
                  onClick={header0.onClick}
                  disabled={!header0.onClick}
                  title={header0.title}
                  className={cn('flex shrink-0 items-center gap-1.5 rounded-[6px] border px-2 py-0.5 text-left transition-colors', seatBox(header0))}
                >
                  <span className="grid h-4 w-4 shrink-0 place-items-center rounded-[4px] border font-mono text-[10px] font-semibold leading-none" style={badgeStyle(header0)}>
                    {header0.piece === 'T' ? '△' : header0.piece}
                  </span>
                  {!header0.empty && (
                    <img
                      src={getAvatarPublicUrl(header0.photoURL)}
                      alt=""
                      aria-hidden="true"
                      onError={avatarFallback}
                      className="h-6 w-6 shrink-0 rounded-full border border-line bg-surface-2 object-contain p-0.5"
                    />
                  )}
                  {(() => {
                    const seconds = timerSecondsFor(header0);
                    const urgent = header0.moveClock > 0 && header0.moveClock <= 5;
                    const awaySeconds = header0.reconnectingSeconds;
                    const away = awaySeconds !== null && awaySeconds !== undefined;
                    return (
                      <span className="flex items-center gap-1 font-mono text-[11px] font-semibold tabular-nums">
                        {away ? (
                          <span className="text-warning">{formatReconnectDuration(awaySeconds)}</span>
                        ) : (
                          <>
                            {header0.moveClock > 0 && (
                              <span
                                className={cn(
                                  'rounded-[4px] px-1 py-0.5 text-[10.5px] leading-none',
                                  urgent ? 'animate-pulse bg-danger-solid text-danger-fg' : 'bg-accent-soft text-accent-text',
                                )}
                              >
                                {header0.moveClock}s<span className="sr-only">{t('game.leftForMove')}</span>
                              </span>
                            )}
                            {seconds !== null && <span className={header0.isTurn ? 'text-ink' : 'text-muted'}>{formatElapsed(seconds)}</span>}
                            {seconds === null && header0.moveClock <= 0 && (
                              <span className="max-w-[72px] truncate font-sans text-xs font-medium text-ink">{header0.name}</span>
                            )}
                          </>
                        )}
                      </span>
                    );
                  })()}
                </button>
              )}
              {botFirstAction && (
                <button
                  type="button"
                  onClick={botFirstAction.onClick}
                  title={botFirstAction.label}
                  className="chip chip-accent min-w-0 overflow-hidden px-2 py-0.5 text-[11px] font-medium hover:brightness-105"
                >
                  <span className="truncate">{botFirstAction.label}</span>
                </button>
              )}
            </div>
            <div className="scrollbar-none flex min-w-0 items-center justify-end overflow-x-auto">
              <GameActionRailOrca {...rail} variant="mobile" />
            </div>
          </div>

          {!isAiMode && (
            <>
              <div
                className="flex shrink-0 items-center border-t border-line bg-surface px-3"
                style={{ height: 'calc(40px + env(safe-area-inset-bottom))', paddingBottom: 'env(safe-area-inset-bottom)' }}
              >
                <button
                  ref={c.chatBarRef}
                  type="button"
                  onClick={() => c.setIsChatOpen(true)}
                  aria-label={openChatLabel}
                  aria-expanded={c.isChatOpen}
                  aria-controls="chat-sheet"
                  aria-describedby="chat-bar-preview"
                  className="flex h-7 w-full items-center justify-between gap-2 rounded-[6px] border border-line bg-surface-2 px-2.5 text-left transition-colors hover:bg-surface-3"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <MessageSquare size={13} strokeWidth={1.75} className="shrink-0 text-muted" aria-hidden="true" />
                    <span id="chat-bar-preview" className="min-w-0 truncate text-xs font-medium text-muted">
                      {c.lastMessagePreview}
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {unreadBadge(c.unreadCount)}
                    <ChevronUp size={14} strokeWidth={1.75} className="text-subtle" aria-hidden="true" />
                  </div>
                </button>
              </div>

              {c.isChatOpen && (
                <div className="fixed inset-0 z-[45] bg-[var(--ui-scrim)] backdrop-blur-[2px]" onClick={c.closeChatSheet} aria-hidden="true" />
              )}

              {/* Closed, the sheet is only moved off screen, so it is inert too. */}
              <div
                id="chat-sheet"
                ref={c.sheetRef}
                role="dialog"
                aria-modal="true"
                aria-label={t('game.chat')}
                aria-hidden={c.isChatOpen ? undefined : true}
                inert={!c.isChatOpen}
                tabIndex={-1}
                onKeyDown={c.trapSheetFocus}
                className={cn(
                  'fixed inset-x-0 bottom-0 z-50 flex flex-col rounded-t-[16px] border-t border-line-strong bg-surface shadow-e2 outline-none transition-transform duration-200 ease-[var(--ease-out-quart)]',
                  c.isChatOpen ? 'translate-y-0' : 'translate-y-full',
                )}
                style={{ height: '80dvh', paddingBottom: 'env(safe-area-inset-bottom)' }}
              >
                <div className="shrink-0 border-b border-line">{chatHeader}</div>
                <div className="flex min-h-0 flex-1 flex-col p-3 pb-0">{c.chatFeed}</div>
                <div className="shrink-0 border-t border-line p-3">{c.composer}</div>
              </div>
            </>
          )}
        </>
      ) : null}

      {c.lightbox}
    </div>
  );
};
