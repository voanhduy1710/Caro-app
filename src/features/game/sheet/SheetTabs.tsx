import React, { memo, useMemo, useRef, useState } from 'react';
import { ChevronDown, Menu, Plus, Sparkles } from 'lucide-react';
import type { BoardMatrix, CellValue } from '../../../shared/utils/gomokuLogic';
import {
  DEFAULT_GAME_TAB,
  updateSheetUi,
  useSheetMatch,
  useSheetUi,
  type SheetMatch,
  type SheetView,
} from '../sheetBridge';
import { REPORTS } from './financeData';
import { decorative, SEPARATOR, type SheetMenuItem } from './menuTypes';
import { SheetDropdownButton } from './SheetMenus';
import { showSheetSnackbar } from './sheetSnackbar';
import { CHROME_FONT, formatClock, formatNumber, HIDDEN_SCROLLBAR } from './sheetStyle';

/**
 * The bottom bar: sheet tabs on the left, Sheets' status readout on the right.
 * The tabs are how the player moves between the game and the two fake
 * reports, and the status bar is where a disguised player reads the clocks
 * and the score, dressed as a selection summary.
 */

interface TabDef {
  id: string;
  name: string;
}

/** A tab that switches what the sheet area shows. */
interface ViewTab extends TabDef {
  view: SheetView;
}

/** Tabs without a view are scenery: there so the file looks lived in. */
const SCENERY_TABS: TabDef[] = [
  { id: 'pivot', name: 'Pivot CP' },
  { id: 'setting', name: 'Setting' },
  { id: 'y2025', name: '2025' },
];

/** A stable number per filled cell, so Sum/Average read as data, not noise. */
const cellNumber = (row: number, col: number, cell: CellValue) => {
  const salt = cell === 'X' ? 7 : cell === 'O' ? 13 : 19;
  return ((row + 1) * 131 + (col + 1) * 71 + salt * 37) % 900 + 100;
};

const boardStats = (board: BoardMatrix) => {
  let sum = 0;
  let count = 0;
  board.forEach((cells, row) =>
    cells.forEach((cell, col) => {
      if (!cell) return;
      sum += cellNumber(row, col, cell);
      count += 1;
    }),
  );
  return { sum, count, average: count ? sum / count : 0 };
};

const formatAverage = (value: number) => value.toLocaleString('en-US', { maximumFractionDigits: 2 });

/** The clocks and the score, as one grey "selection info" pill. */
const MatchPill: React.FC<{ match: SheetMatch }> = ({ match }) => {
  const seats = match.seats.filter((seat) => !seat.empty);
  const clocks = seats.filter((seat) => seat.clock > 0);
  const turn = seats.find((seat) => seat.isTurn && seat.moveClock > 0);
  const hasScore = match.score.length > 1 && match.score.some((n) => n > 0);
  if (!clocks.length && !turn && !hasScore) return null;
  const urgent = Boolean(turn && turn.moveClock < 6);
  // A phone has no room for every clock and the score beside the tabs, so it
  // keeps the one number that matters right now: the move timer, else the
  // clock of whoever is on turn, else the score.
  const turnSeat = seats.find((seat) => seat.isTurn);
  const compactText = turn
    ? `⏱ ${Math.ceil(turn.moveClock)}s`
    : turnSeat && turnSeat.clock > 0
    ? `${turnSeat.piece} ${formatClock(turnSeat.clock)}`
    : hasScore
    ? `Tỷ lệ: ${match.score.join(' - ')}`
    : clocks.map((seat) => `${seat.piece} ${formatClock(seat.clock)}`).join(' · ');
  return (
    <>
      <span
        className={`inline-flex h-5 shrink-0 items-center rounded-[10px] bg-[#e8eaed] px-2.5 text-[12px] whitespace-nowrap tabular-nums sm:hidden ${
          urgent ? 'font-semibold text-[#d93025]' : 'text-[#3c4043]'
        }`}
      >
        {compactText}
      </span>
      <span className="hidden h-5 shrink-0 items-center gap-1.5 rounded-[10px] bg-[#e8eaed] px-2.5 text-[12px] whitespace-nowrap text-[#3c4043] tabular-nums sm:inline-flex">
        {clocks.length > 0 && (
          <span>{clocks.map((seat) => `${seat.piece} ${formatClock(seat.clock)}`).join(' · ')}</span>
        )}
        {turn && (
          <>
            {clocks.length > 0 && <span aria-hidden="true">·</span>}
            <span className={urgent ? 'font-semibold text-[#d93025]' : ''}>⏱ {Math.ceil(turn.moveClock)}s</span>
          </>
        )}
        {hasScore && (
          <>
            {(clocks.length > 0 || turn) && <span aria-hidden="true">·</span>}
            <span>Tỷ lệ: {match.score.join(' - ')}</span>
          </>
        )}
      </span>
    </>
  );
};

const TAB_BASE =
  'inline-flex h-7 shrink-0 items-center gap-1.5 rounded-t-md px-[14px] text-[12px] whitespace-nowrap outline-none focus-visible:ring-2 focus-visible:ring-[#0b57d0] focus-visible:ring-inset';
const TAB_ACTIVE = 'border border-b-2 border-[#e0e0e0] border-b-[#0F9D58] bg-white font-semibold text-[#0F9D58]';
const TAB_IDLE = 'border border-transparent text-[#444746] hover:bg-[#e8ecf1]';

const ROUND_BUTTON =
  'grid h-7 w-7 shrink-0 place-items-center rounded-full text-[#444746] outline-none hover:bg-[#e8ecf1] focus-visible:ring-2 focus-visible:ring-[#0b57d0]';

/** Inline editor for the game tab's name, opened by a double-click or "Đổi tên". */
const TabRenameInput: React.FC<{ initial: string; onDone: () => void }> = ({ initial, onDone }) => {
  const [draft, setDraft] = useState(initial);
  const cancelled = useRef(false);
  return (
    <input
      autoFocus
      value={draft}
      maxLength={40}
      aria-label="Tên trang tính"
      onFocus={(event) => event.currentTarget.select()}
      onChange={(event) => setDraft(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          event.currentTarget.blur();
        } else if (event.key === 'Escape') {
          // Handled here, so the boss key leaves this Escape alone.
          event.preventDefault();
          cancelled.current = true;
          event.currentTarget.blur();
        }
      }}
      onBlur={() => {
        if (!cancelled.current) updateSheetUi({ gameTabName: draft.trim() || DEFAULT_GAME_TAB });
        onDone();
      }}
      className="h-7 shrink-0 rounded-t-md border-2 border-[#0b57d0] bg-white px-2 text-[12px] font-semibold text-[#202124] outline-none"
      style={{ width: `${Math.max(6, draft.length + 2)}ch` }}
    />
  );
};

/** Memoised: Board re-renders on every hovered cell, the board itself does not change then. */
export const SheetTabs = memo(({ board }: { board: BoardMatrix }) => {
  const ui = useSheetUi();
  const match = useSheetMatch();
  const [renaming, setRenaming] = useState(false);
  const gameStats = useMemo(() => boardStats(board), [board]);
  const stats = ui.view === 'game' ? gameStats : REPORTS[ui.view].stats;

  const realTabs: ViewTab[] = [
    { id: 'game', name: ui.gameTabName, view: 'game' },
    { id: 'finance', name: REPORTS.finance.name, view: 'finance' },
    { id: 'balance', name: REPORTS.balance.name, view: 'balance' },
  ];

  const allSheetsItems: SheetMenuItem[] = [
    ...realTabs.map<SheetMenuItem>((tab) => ({
      kind: 'item',
      label: tab.name,
      checked: ui.view === tab.view,
      ariaLabel: tab.view === 'game' ? `${tab.name} (bàn cờ)` : `${tab.name} (báo cáo giả)`,
      onSelect: () => updateSheetUi({ view: tab.view }),
    })),
    ...SCENERY_TABS.map((tab) => decorative(tab.name)),
  ];

  const tabMenu = (tab: ViewTab): SheetMenuItem[] => [
    tab.view === 'game'
      ? { kind: 'item', label: 'Đổi tên', ariaLabel: 'Đổi tên trang tính', onSelect: () => setRenaming(true) }
      : decorative('Đổi tên'),
    decorative('Xóa'),
    decorative('Tạo bản sao'),
    decorative('Sao chép vào'),
    SEPARATOR,
    decorative('Đổi màu'),
    decorative('Bảo vệ trang tính'),
    decorative('Ẩn trang tính'),
  ];

  return (
    <div
      className="flex h-9 w-full shrink-0 items-center gap-1 border-t border-[#e0e0e0] bg-[#f8fafd] pr-2 pl-2 text-[12px] text-[#444746] select-none sm:pl-3"
      style={{ fontFamily: CHROME_FONT }}
    >
      <button type="button" tabIndex={-1} aria-hidden="true" title="Thêm trang tính" className={ROUND_BUTTON}>
        <Plus size={18} />
      </button>
      <SheetDropdownButton
        items={allSheetsItems}
        title="Tất cả trang tính"
        ariaLabel="Tất cả trang tính (chuyển giữa bàn cờ và báo cáo giả)"
        className={ROUND_BUTTON}
        openClassName="bg-[#d3e3fd]! text-[#041e49]!"
        placement="above"
      >
        <Menu size={17} aria-hidden="true" />
      </SheetDropdownButton>

      {/* A floor on the strip's width, so the status readout can never squeeze
          the game and report tabs out of reach. */}
      <div className={`ml-1 flex h-full min-w-[120px] flex-1 items-center gap-0.5 overflow-x-auto ${HIDDEN_SCROLLBAR}`}>
        {realTabs.map((tab) => {
          const active = ui.view === tab.view;
          if (tab.view === 'game' && renaming) {
            return <TabRenameInput key={tab.id} initial={ui.gameTabName} onDone={() => setRenaming(false)} />;
          }
          return (
            <SheetDropdownButton
              key={tab.id}
              items={tabMenu(tab)}
              ariaLabel={`${tab.name} (${tab.view === 'game' ? 'bàn cờ' : 'báo cáo giả'}${active ? ', đang mở' : ''})`}
              className={`${TAB_BASE} ${active ? TAB_ACTIVE : TAB_IDLE}`}
              openClassName=""
              placement="above"
              minWidth={200}
              onPress={() => updateSheetUi({ view: tab.view })}
              onDoubleClick={tab.view === 'game' ? () => setRenaming(true) : undefined}
              // Only the caret opens the tab's menu; a click on the name selects it.
              opensOnPress={(event) => (event.target as HTMLElement).closest('[data-sheet-caret]') !== null}
            >
              <span>{tab.name}</span>
              <span data-sheet-caret="" className="-mr-1.5 grid h-5 w-5 place-items-center rounded-full hover:bg-[rgba(68,71,70,0.12)]">
                <ChevronDown size={14} aria-hidden="true" />
              </span>
            </SheetDropdownButton>
          );
        })}
        {SCENERY_TABS.map((tab) => (
          <span key={tab.id} aria-hidden="true" className={`${TAB_BASE} ${TAB_IDLE} cursor-default`}>
            {tab.name}
            <ChevronDown size={14} className="-mr-1.5" />
          </span>
        ))}
      </div>

      <div className="flex shrink-0 items-center gap-3 pl-2 whitespace-nowrap">
        <span className="hidden font-semibold text-[#0F9D58] sm:inline">Sẵn sàng</span>
        {ui.view === 'game' && match && <MatchPill match={match} />}
        <span className="hidden tabular-nums lg:inline">Trung bình: {stats.count ? formatAverage(stats.average) : '0'}</span>
        <span className="hidden tabular-nums md:inline">Đếm: {stats.count}</span>
        <span className="hidden tabular-nums md:inline">Tổng: {formatNumber(stats.sum)}</span>
        <button
          type="button"
          title="Khám phá (Alt+Shift+X)"
          aria-label="Khám phá"
          onClick={() => showSheetSnackbar('Không có đề xuất nào cho dữ liệu này')}
          className="hidden h-7 items-center gap-1.5 rounded-[14px] border border-[#dadce0] bg-white px-3 text-[12px] font-medium text-[#444746] outline-none hover:bg-[#f1f3f4] focus-visible:ring-2 focus-visible:ring-[#0b57d0] sm:inline-flex"
        >
          <Sparkles size={14} className="text-[#0F9D58]" aria-hidden="true" />
          Khám phá
        </button>
      </div>
    </div>
  );
});

SheetTabs.displayName = 'SheetTabs';
