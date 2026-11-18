# Orca style (PR 5 look as a switchable app style) — plan

Date: 2026-11-18. Owner decisions (2026-11-18):
- Settings → **Style**: `Default` (today's look) / `Orca` (PR 5's look). New visitors get `Default`.
- `Orca` must look **exactly like PR 5** — shell, titlebar, sidebars, mobile chrome, every restyled screen and dialog.
- **Not** PR 5's concurrent multi-room tabs (its room-hook rewrite). One room / match at a time, as today.
- Orca is **not** a board option any more. In the Orca style the default (graph paper) board renders PR 5's code grid
  (gutter, star points, crosshair); bamboo / laser / spreadsheet look the same in both styles.

PR 5 source: local branch `pr-5` (`git show pr-5:<path>`, `git diff main...pr-5 -- <path>`). Design doc:
`git show pr-5:docs/superpowers/specs/2026-11-13-orca-ide-ui-redesign-design.md`. PR base is `701fbd0`; `main` (HEAD)
is `caec129`; the working tree carries a large uncommitted review/clean-up/security round on top (see
the round-1 and round-2 review fixes). Every behaviour fix in the working tree must survive in both styles.

## Already in place (main agent)
- `src/features/theme/uiStyle.ts`: `UI_STYLES`, `useUiStyle()`, `useIsOrca()`, `setUiStyle()`, `getUiStyle()`;
  stamps `<html data-ui-style="orca">` (absent = default). `index.html` stamps it before first paint.
- Settings → Style group (`SettingsAndThemeModal.tsx`), i18n `settings.style*`.
- Board: `isOrcaTheme = uiStyle === 'orca' && boardTheme === 'graph_paper'` → code grid (`BoardOrcaParts.tsx`,
  `orcaStarPoints.ts`, `.board-theme-orca-code` / `.orca-*` in `index-motion.css`, `--board-code-*` tokens).

## Conventions (all porters follow these)
1. **Default style is untouched.** No visual change at all when `data-ui-style` is absent. Verify by diffing
   behaviour, and in the browser.
2. **CSS:** PR 5's tokens / primitives / game CSS go in new files under `src/styles/orca/` imported from
   `src/styles/index.css`, every rule scoped under `:root[data-ui-style='orca']` (tokens: redefine the same
   `--ui-*` / `--font-*` / `--radius-*` / `--shadow-*` names so existing Tailwind utilities follow; light/dark use the
   existing `data-ui-theme` + `prefers-color-scheme` pattern, combined with the style attribute). Font `Geist` goes in
   `public/fonts/Geist-Variable.woff2` (from `pr-5`). Keep Baloo 2 for Default.
3. **Components:** where PR 5 changed a component's markup, add an Orca variant next to it — `X.orca.tsx` exporting
   `XOrca` — built from PR 5's version and adapted to **today's** props, hooks and logic (never PR 5's logic where the
   working tree has since fixed it). The original `X` stays the default; switch at the narrowest sensible boundary:
   `const isOrca = useIsOrca(); return isOrca ? <XOrca {...props}/> : <XDefault {...props}/>`. Extract shared logic
   into a hook rather than copying it when a component has real logic (e.g. modal state, chat, focus trap).
   Hooks must not be called conditionally across the switch.
4. **New shell pieces** (`src/app/shell/*`, `src/shared/ui/primitives.tsx`, `src/shared/ui/cn.ts`) are Orca-only and
   can be taken from PR 5 almost as-is, minus multi-room (`RoomSessionSlot` multi-slot logic: keep one slot).
5. **Must keep in both styles:** `window.__caro` dev hooks and the e2e invariants listed in the PR 5 design doc
   ("Constraints"); i18n via `useT()` (no hard-coded English; add EN+VI keys); focus trap (`useFocusTrap` /
   `useModalChrome`); keyboard board play; Spreadsheet disguise (`SheetChrome`, `Ctrl+Q`, `Ctrl+\``) — PR 5's
   titlebar `Orca | GGS` pill sets `boardTheme='spreadsheet'`; `<Board />` must not remount when switching style,
   disguise or sidebars.
6. **No new runtime dependencies** unless PR 5 added them (it added none besides fonts; `clsx`/`tailwind-merge` were
   removed — PR's `cn.ts` must not need them).
7. Do not touch `src/features/room/roomEngine*`, `protocol.ts`, `supabase/**`, `api/**`; room hooks only if a view
   needs a value that exists in PR 5's hook — add it minimally and say so.
8. Tests: `npx tsc -b`, `npx vitest run`, `npx oxlint`, `npx vite build` clean at the end of each phase.

## Phases
- **A — foundation + shell (one agent, first):** Orca tokens/CSS/fonts scoped; primitives; Orca app shell (titlebar,
  left sidebar, right pane, mobile chrome, workspace tabs `lobby | match | leaderboard | history | settings` with the
  match kept mounted); Orca lobby/home (`HomePlayActions`, `HomeLobbyMeta`, `PublicRoomList`, `AppFeedback`,
  `AppNavbar`/`Navbar`); `AppView` switches shell by style. Ends by appending "Ported" notes below.
- **B — match screens (after A):** `Board` chrome, `BoardCells`, `MatchHeader`, `GameControlsView`, `GameActionRail`,
  chat (`GameChat*`, `GameReactionPicker`, `GameChatLightbox`), `PracticeMatchView`, `ActiveMatchStage`,
  minigames, sheet bits PR 5 touched (`SheetMenus`, `SheetTopBar`).
- **C — rooms + dialogs (after A, parallel with B):** `OnlineRoom*`, `RoomRoster`, `ChatRoomView`, `TeaseToast`,
  `AuthModal`, `ProfileModal`, `OpponentProfileModal`, `HistoryModal`, `LeaderboardModal`, `RankGuideModal`,
  `SettingsAndThemeModal`, `AppModalStack`, pairing (`PairMobileModal`, `QrScanner`, `RemoteMatchApp`),
  `ListSkeleton`, `RankBadge`. Leaderboard / History / Settings also render as workspace tab pages in Orca (PR 5).

## Ported (filled in by each phase)

### Phase A — foundation + shell (Opus 5.5 subagent, 2026-11-18, not committed)

**Built**
- CSS `src/styles/orca/{index,tokens,primitives,game}.css`, imported last from `src/styles/index.css`. PR 5's tokens
  (light/dark/disguise), base + component primitives (`.btn*`, `.card`, `.chip*`, `.field*`, `.modal-*`, `.orca-titlebar`,
  `.orca-tab`, `.orca-icon-btn`, `.scrollbar-orca`, `@utility scrollbar-none`), PR 5 motion (as `orca-*` keyframes),
  board-frame height budget (`100dvh-104px` desktop, `min(100dvh-168px,100vw)` mobile), ping/forced-cell look and the
  Sheets disguise rules. Board themes untouched (bamboo/laser/spreadsheet identical in both styles; code grid is main's).
  Geist: `@font-face` in `orca/tokens.css`, `public/fonts/Geist-Variable.woff2` (69 560 B, same blob as pr-5).
- `src/shared/ui/primitives.tsx` (PR 5: Button, IconButton, SegmentedControl, Kbd, Badge, Dialog — Dialog's close label
  now `t('common.close')`), `src/shared/ui/cn.ts` (no deps; joins classes AND resolves same-group Tailwind conflicts,
  later wins, like tailwind-merge for the common groups; `cn.test.ts`).
- `useUiTheme` is now one shared store (Settings and the shell agree) + PR 5's `toggleLightDark`. No saved choice →
  Default light (as before), Orca dark. `index.html` stamps the dark default and preloads Geist only for Orca.
- Shell `src/app/shell/`: `OrcaTitlebar`, `OrcaSidebar`, `MobileChrome` (`MobileTopbar`, `MobileBottomTabs`) from PR 5
  with ONE session tab; `OrcaWorkspace` (lobby + page tabs); `types.ts` (`WorkspaceSurface = lobby | match |
  leaderboard | history | settings`, `SessionTabItem`); `useAppVisualMode` (Orca | GGS pill: GGS = boardTheme
  `spreadsheet` + `setDisguised(true)`, back = last non-sheet board kept under `caro:last-board-theme`;
  ThemeContext unchanged); `useShellUiTheme`; `orcaShellContext.ts` + `OrcaRightPane.tsx` (right-pane API, below).
- Lobby variants: `HomePlayActions.orca.tsx`, `HomeLobbyMeta.orca.tsx`, `PublicRoomList.orca.tsx`,
  `AppFeedback.orca.tsx`. Each original file now exports `X = isOrca ? <XOrca/> : <XDefault/>` (Default body unchanged).
  Today's logic kept: private room = `ranked` mode, seat counts use `room.seats` (3-player), rules chip i18n.
- `AppView.tsx`: one component, shared logic, two layouts. Same element types at the same tree positions down to
  `<ActiveMatchStage>` (Default uses `display: contents` boxes), so style switch, Ctrl+B sidebar, tab switch and the
  disguise never remount the match (browser-checked: same DOM node + stones kept). In Orca the match stays mounted with
  `hidden` behind other tabs; bot clocks pause while off-screen (PR 5). One room/match at a time: lobby/sidebar actions
  during a live session ask (`home.switchSession*`) and then leave the room / drop the practice board; joining the room
  you are in just shows it. Back closes a page tab first, else the match's exit flow (same guard as today). Default modals
  ↔ Orca page tabs hand over on a style switch. i18n EN+VI: `common.mode*`, `common.toggle*`, `common.members`,
  `home.tab*`, `home.orca*`, `home.navLobby`, `home.switchSession*`, `home.ruleUndo`, `settings.workspaceMode(Hint)`.
- Not used: PR 5's `Navbar`/`AppNavbar`/`AppPageShell` changes (dead code in PR 5 — the titlebar replaces the navbar),
  PR 5's `RoomSessionSlot` (single `useRoom` in AppView stays), its board-theme CSS and old minigame CSS removal.

**Scoping pattern (all Orca CSS)**
- Tokens `:root[data-ui-style='orca']` (light) / `…:not([data-ui-theme='light'])` in `prefers-color-scheme: dark` /
  `…[data-ui-theme='dark']`; disguise `html:root[data-ui-style='orca'][data-sheet-disguise='on']`. Each is one step more
  specific than its Default twin, so order does not matter.
- Rules: `:root[data-ui-style='orca'] { & .class {…} }` inside the SAME `@layer` as the Default rule (base/components),
  so Tailwind utilities still beat them. Where a class exists in both styles the Orca rule also resets Default-only
  properties (box-shadow ledge, transforms, display font). Under the disguise, Orca restates every Sheets property
  (`&[data-sheet-disguise='on'] .btn …`) because Orca `.btn` outranks the shared disguise rule.
- `@theme inline` in `orca/tokens.css` re-routes `font-sans/-display/-mono`, `rounded-xs…xl`, `ease-pop` through
  `--ui-*` vars with today's values as fallbacks (Default computes identically) and adds PR 5 colours `bg-editor`,
  `bg-sidebar`, `bg-primary`, `text-primary-fg`, `bg-brand*`, `text-success`, `shadow-e1`.
- Keyframes cannot be scoped: add PR 5 versions as `orca-*` and point scoped rules at them.
- `--ui-lift`/`--ui-*-shadow` are transparent in Orca, so a not-yet-ported Default screen loses its 3D ledge.

**Shell slot / right-pane API** (`src/app/shell/orcaShellContext.ts`)
- `useOrcaShell()` → `null` in Default, else `{ surface, matchVisible, sidebarOpen, toggleSidebar, rightPaneTarget }`.
- `<OrcaRightPane>{…}</OrcaRightPane>` portals into a `display: contents` slot at the right edge of the shell row (after
  `<main>`); give the portalled element its own `w-[310px] shrink-0 border-l border-line bg-sidebar hidden lg:flex`.
  PR 5 itself drew chat/roster INSIDE GameControlsView (`layout === 'desktop'` aside, 310px) — doing the same is the
  closest match; use the slot only for content that must sit outside the match stage.
- Match stage box: `flex flex-1 min-h-0 w-full flex-col`, `overflow-hidden` in a game / chat room, `scrollbar-orca
  overflow-y-auto` in a waiting room, `h-[100dvh]` under the disguise; titlebar/sidebar/mobile bars hidden under the
  disguise; on mobile the top bar hides while a game (not a waiting/chat room) is in front and the bottom bar hides on
  the match tab — the match views must bring their own back/exit (PR 5's opponent strip).

**Phase B must plug in**
- `GameControlsView`/`PracticeMatchView`/`ActiveMatchStage` Orca variants: today's `.match-stage` (calc(100dvh-97px),
  240px/320px columns) still renders inside the Orca stage and does not fill it — replace with PR 5's 4-layout stage
  (one persistent `<Board />` slot; `useOrcaShell()?.matchVisible` if it needs to know it is hidden). Board chrome,
  MatchHeader, GameActionRail, chat, minigames, SheetMenus/SheetTopBar ("Switch to Orca IDE" → `useAppVisualMode`).
- `.board-frame` budget in Orca already matches PR 5's 36px titlebar + 44px toolbar.

**Phase C must plug in**
- `LeaderboardModal`, `HistoryModal`, `SettingsAndThemeModal` page versions: `OrcaWorkspace.tsx` currently opens today's
  modals over an empty page (closing = closing the tab). Give them PR 5's `embedded` prop (or `*.orca.tsx` page
  variants) and swap the three marked blocks. Settings page should also show PR 5's `settings.workspaceMode` row.
- Room/dialog Orca variants (`OnlineRoom*`, `RoomRoster`, `ChatRoomView`, `TeaseToast`, Auth/Profile/Opponent, RankGuide,
  `AppModalStack` dialogs, pairing, `ListSkeleton`, `RankBadge`), on `primitives.tsx` (`Dialog` uses `useModalChrome`).
- `AppModalStack` itself is unchanged and renders in both styles (in Orca its leaderboard/history modals stay closed).

### Phase B — match screens (Opus 5.5 subagent, 2026-11-18, not committed)

**Built**
- `GameControlsView.tsx` stays ONE component for both styles: all hooks/state run unconditionally, then
  `isOrca ? renderGameControlsOrca(ctx) : <today's JSX>`. `GameControlsView.orca.tsx` exports a plain render function
  (not a component), so the root `<div>` and the board slot (root child 1, `boardNode` its child 1) are the same
  elements in both styles: style switch, GGS/Ctrl+Q, chat toggle and the 1024px breakpoint keep `<Board />` (sketches
  survive — browser-checked). PR 5's four layouts: desktop/solo = 248px match sidebar (back, rules, meta strip, seat
  cards, roster, actions) | stage | 310px chat column with collapse + floating "Chat" button; mobile = opponent strip
  (back arrow, opponents, score, members popover, display&sound, rules) | edge-to-edge board | self strip + icon actions
  | chat pill → 80dvh bottom sheet (today's focus trap `focusableIn/trapTabTarget`, inert when closed, Escape). New
  Orca-only state (`isMobileRosterOpen` + refs) is declared in both styles. Today's chat-open/offer logic kept.
- `GameActionRail.orca.tsx` (`sidebar` | `mobile` variants, `PrefsPopover`), `MatchHeader.orca.tsx` (score bar + 1px
  seat cards, RankBadge/ELO, buzz bell only for `role === 'player'` on other seats; `game.buzzTitle` label, so viewers
  never get `[aria-label="Buzz the other player"]`). `MatchHeaderProps` is exported and gained optional
  `playerTimers/myUser/opponent/isAiMode/role/onNudgeOpponent/nudgeDisabled`; `SeatView` optional `elo/isGuest`
  (PracticeMatchView fills them; Default ignores them).
- Board chrome: `BoardOverlays.orca.tsx` (result toast, paused card, count-in with flat coin + RPS glyph reveal),
  switched per overlay inside Board (no remount). `BoardCells`: `orca` prop (= code grid only) → PR 5 thin glyphs, last
  move tint + corner brackets, flat win ring, dashed bot-hint target (`data-bot-hint`); keyboard/`liveRef`-style
  handlers unchanged.
- Chat: `GameChatHeader/Feed/Composer/Lightbox.orca.tsx`, each original exports the switch; `GameReactionPicker`
  switches classes/padding inline. Kept: `role=log` feed, header `aria-controls` only when open, lightbox
  `useFocusTrap` (in the wrapper, around both looks), picker focus trap, IME check (in EmoteInput/useGameChat).
  `jumpTo` moved to `chatJump.ts`.
- Minigames: `CoinTossModal.orca.tsx`, `RockPaperScissorsModal.orca.tsx` (PR 5 dialogs on `.modal-scrim/.modal-panel`,
  one set of three hand buttons, PR 5's hard-coded EN/VI strings moved to i18n `game.minigame.orca*` EN+VI).
- Sheets: `SheetTopBar` "Orca IDE" pill (`data-testid="sheet-switch-to-orca"`) and `SheetMenuBar` "Switch to Orca IDE"
  item at the end of Xem, both only when `useIsOrca()`; they call `useAppVisualMode().setAppMode('orca')`. Default's
  disguise has neither (browser-checked).

**Deviations from PR 5**
- The brief mentioned a 40px toolbar above the board; PR 5's code has none (actions live in the 248px sidebar), so
  PR 5's code was followed. Chat/roster are drawn inside GameControls as PR 5 did, not via `<OrcaRightPane>`.
- PR 5's piece/last-move/win restyle applies only to the code grid (bamboo/laser/spreadsheet unchanged, per plan).
- Colours use today's `pieceColor()` constants (not PR 5's MUTED_*); the third seat's timer is not added to practice
  `playerTimers` (it would change Default's clock row).
- `PracticeMatchView` / `ActiveMatchStage`: no layout change needed (stage classes do PR 5's sizing).

**For Phase C / main**
- `OnlineRoomView` needs no change: `GameControls` props are unchanged. In Orca, `rosterNode` renders inside the 248px
  sidebar (desktop) and a 288px popover (phone) — RoomRoster's Orca look should fit `[&>section]:mx-0 mb-0`.
- Not browser-checked: online room chat column / phone chat sheet, coin toss and RPS dialogs (need a live room).

### Phase C — rooms + dialogs (Opus 5.5 subagent, 2026-11-18, not committed)

**Built** (each original file keeps its Default body and switches with `useIsOrca()`; logic shared, never PR 5's)
- Rooms: `OnlineRoomLobby.orca.tsx` (PR 5 card: header bar with kind/code/invite/share/pair/rules/leave, rule chips,
  seat-card grid with become-viewer + host remove-from-seat icons, roster, auto-start footer — still no ready/start),
  `RoomRoster.orca.tsx`, `ChatRoomView.orca.tsx` (`ChatRoomLayoutOrca`: channel bar, editor chat, 260px roster aside /
  phone drawer; `ChatRoomView` runs `useGameChat` + "Seen" once for both looks), `OnlineRoomOverlays.orca.tsx`
  (confirm dialog incl. Sheets variant, host-lost strip, connecting card, take-back / rematch / open-seat prompts as
  `OnlineRoomRequestsOrca`). `OnlineRoomView`: renders `OnlineRoomRequestsOrca` in Orca, paused-overlay buttons get
  `btn-sm tabular-nums` in Orca; all conditions and room logic untouched. `TeaseToast`, `ListSkeleton`, `RankBadge`:
  inline/variant switch.
- Dialogs: `OpponentProfileModal.orca.tsx`; `ProfileModal.orca.tsx` (view only — ProfileModal keeps all state and
  today's password form: new + confirm, `PASSWORD_MIN_LENGTH`, no 123456; adds PR 5's streak cell and guest
  sign-in/create call-out via `openAuthModal`); `AuthModal` (inline class switch + subtitle + "Continue as guest",
  validation via `authRules.ts` unchanged); `HistoryModal.orca.tsx`, `LeaderboardModal.orca.tsx`,
  `RankGuideModal.orca.tsx`, `SettingsAndThemeModal.orca.tsx` — each with PR 5's `embedded` page form.
  New shared hooks: `history/useMatchHistory.ts` (today's uid-tagged, stale-safe load + `reload`),
  `leaderboard/useLeaderboard.ts`; `leaderboard/rankRange.ts` (`formatEloRange`); `settings/settingsOptions.ts`
  (option lists / presets / swatch names moved out of the Default file).
- Settings (Orca): Style (Default/Orca) row kept, PR 5's Interface mode row (Orca IDE / Google Sheets →
  `useAppVisualMode`), language segmented control in the header, Board before Pieces as in PR 5.
- `OrcaWorkspace.tsx`: the three page blocks now render `LeaderboardModalOrca/HistoryModalOrca/
  SettingsAndThemeModalOrca` with `isOpen embedded` in PR 5's containers. `AppModalStack` unchanged (its children
  switch themselves).
- Pairing: `PairMobileModal`, `QrScanner` (PR 5 square camera dialog), `RemoteMatchApp` (status bar, notice card,
  root) — Orca markup branches after the hooks.
- i18n EN+VI: `common.authSignInSubtitle/authCreateSubtitle/continueAsGuest`, `settings.pieceColours`,
  `profile.orca.*`, `home.orca.history.*`, `home.orca.leaderboard.subtitle`, `home.orca.rankGuide.subtitle`.
- No `dialogs.css`/`rooms.css` needed: everything is Tailwind + Phase A's scoped primitives (`shadow-e2` already
  exists in tokens.css and follows the Orca `--ui-shadow-lg`).

**Deviations from PR 5**
- Piece colours: today's ThemeContext (no PR 5 muted palette), so Settings shows today's swatches and no "Reset subtle
  palette" button; lobby seat chips use `pieceColor()` instead of `MUTED_T_COLOR`.
- PR 5's "Reset to 123456" button and min-6 password rule are not ported (today's form kept).
- PR 5 strings that were new and hard-coded English (subtitles, guest call-out, relative times, "Bot/Online") are i18n
  keys; strings that are English-only in Default too (titles, "Refresh", "Rank guide") stay as they are.
- PR 5's `py-0.2` (not a valid Tailwind step, rendered as 0) written as no vertical padding.
- AuthModal and ProfileModal switch inline / via a view component rather than a full `X.orca.tsx` component, because
  both own a lot of form state that must not fork.
- Room dialogs (confirm/undo/rematch) have no focus trap in either style (as today).

**Checks:** `npx tsc -b` clean; `npx vitest run` 407 passed / 1 skipped (incl. LeaderboardModal.test.tsx);
`npx oxlint` no new warnings in phase C files; `npx vite build` OK. Browser (port 5203, two isolated contexts):
Orca dark + light, 1440x900 + 390x844 — sign-in, profile (guest), Leaderboard / Rank guide / History / Settings pages,
Settings dialog mid-room, waiting room, joined game, chat message, resign confirm, rematch prompt ("Play again?"),
open-seat prompt after host removed the seat, chat-only room + phone roster drawer; Default light/dark: chat room,
rank guide, history, sign-in on phone — unchanged. Not browser-checked: pair-mobile modal / QR scanner / remote phone
(need a signed-in account), tease toast, host-lost strip, connecting card.

**For main:** nothing to wire. Phase B's GameControls renders `rosterNode` in its sidebar; the Orca roster has no outer
margins so it fits as is.
