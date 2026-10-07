import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { BoardMatrix, CellValue } from '../../shared/utils/gomokuLogic';
import { columnLabel } from '../../shared/utils/gomokuLogic';
import { getDisguised, setDisguised } from './disguiseMode';
import { setDisplayPref, useDisplayPrefs } from './displayPrefs';
import {
  SHEET_ZOOM_STEPS,
  sheetActionsStore,
  sheetUiStore,
  stepSheetZoom,
  updateSheetUi,
  useSheetActions,
  useSheetUi,
} from './sheetBridge';
import { decorative, SEPARATOR, type SheetMenuDef, type SheetMenuItem } from './sheet/menuTypes';
import { useReportCell } from './sheet/reportCell';
import { isActionReady } from './sheet/runAction';
import {
  centerSheetBoard,
  clearSheetSketches,
  openSheetHelp,
  openSheetSettings,
  setSheetZoom,
  sheetExit,
  sheetRematch,
  sheetResign,
  sheetShare,
  sheetTakeSeat,
  sheetUndo,
  toggleSheetComments,
} from './sheet/sheetCommands';
import { SheetHelpDialog } from './sheet/SheetHelpDialog';
import { showSheetSnackbar } from './sheet/sheetSnackbar';
import { CELL_FONT, CHROME_FONT, isEditableTarget, PENDING_TEXT } from './sheet/sheetStyle';
import { SheetSnackbar } from './sheet/Snackbar';
import { SheetToolbar } from './sheet/SheetToolbar';
import { SheetTopBar } from './sheet/SheetTopBar';

export { SheetTabs } from './sheet/SheetTabs';
export { SheetFinanceView } from './sheet/SheetFinanceView';

/**
 * The "boss key" board skin. A match under this theme is dressed as a Google
 * Sheets-style document: header, menus, toolbar and formula bar here, sheet
 * tabs and status bar in SheetTabs, a fake report in SheetFinanceView. Unlike
 * a costume, the controls work: the game's own commands (take back, next
 * game, resign, leave, chat, zoom) are reached through Sheets' toolbar and
 * menus, so a disguised player never has to drop the disguise to play.
 *
 * Every control's tooltip is pure Sheets wording, since that is what a
 * bystander sees; the accessible name says what it really does.
 */

/** Business-report filler, picked deterministically per cell so it does not
 *  flicker as hover/last-move recomputes it on every render. */
const REPORT_LINES = [
  'Đã cập nhật tiến độ theo kế hoạch',
  'Chờ xác nhận từ phòng ban liên quan',
  'Số liệu khớp với báo cáo tuần trước',
  'Đang rà soát lại trước khi trình ký',
  'Hoàn thành, không phát sinh vấn đề',
  'Cần bổ sung dữ liệu cho quý sau',
  'Đã đối chiếu xong với kế toán',
  'Chuyển trưởng nhóm duyệt lại',
  'Đạt chỉ tiêu đề ra tuần này',
  'Ghi nhận, chưa cần xử lý thêm',
];

const fakeCellText = (row: number, col: number, cell: CellValue): string => {
  if (!cell) return '';
  const pieceSalt = cell === 'X' ? 7 : cell === 'O' ? 13 : 19;
  const idx = (row * 31 + col * 17 + pieceSalt) % REPORT_LINES.length;
  const mark = cell === 'X' ? '✓' : cell === 'T' ? '◇' : '•';
  return `${mark} ${REPORT_LINES[idx]}`;
};

/**
 * Whether a dialog other than the chrome's own help dialog is on screen. A
 * modal that is closed but still mounted (the phone chat sheet is only moved
 * off screen and made inert) does not count, and neither does one the report
 * view is hiding with CSS, or Escape and every shortcut would stay dead.
 */
const foreignModalOpen = () =>
  Array.from(document.querySelectorAll<HTMLElement>('[aria-modal="true"]:not([data-sheet-dialog])')).some(
    (el) => !el.closest('[inert], [aria-hidden="true"]') && el.getClientRects().length > 0,
  );

/**
 * The window-level keys while the Spreadsheet board is on screen.
 *
 * Ctrl+Q is the boss key: from the real game UI it puts the disguise on and
 * jumps to the fake report; while disguised it flips between the report and
 * the board. The comments panel is closed on the way to the report, since the
 * chat is the one part of the page that reads as a game. Escape is left to
 * close dialogs, dropdowns and the like.
 */
const handleSheetKey = (event: KeyboardEvent, toggleCompact: () => void) => {
  if (event.defaultPrevented) return;
  const ui = sheetUiStore.get();

  if (event.key === 'Escape') {
    if (ui.helpOpen) {
      event.preventDefault();
      updateSheetUi({ helpOpen: false });
    }
    return;
  }

  // Matched on the physical key so it works on any layout. Ctrl+Q types
  // nothing, so it fires from text fields too: someone caught mid-message
  // needs the boss key most.
  if (event.ctrlKey && !event.altKey && !event.shiftKey && !event.metaKey && event.code === 'KeyQ') {
    event.preventDefault();
    if (ui.helpOpen) updateSheetUi({ helpOpen: false });
    if (foreignModalOpen()) {
      // A game dialog (a take-back request, a confirm, Settings) is exactly
      // when the panic key matters most. The report goes up anyway and global
      // CSS hides the dialog under it until the player flips back.
      if (!getDisguised()) setDisguised(true);
      updateSheetUi({ view: 'finance', commentsOpen: false });
      return;
    }
    if (!getDisguised()) {
      setDisguised(true);
      updateSheetUi({ view: 'finance', commentsOpen: false });
    } else if (ui.view === 'game') {
      updateSheetUi({ view: 'finance', commentsOpen: false });
    } else {
      updateSheetUi({ view: 'game' });
    }
    return;
  }

  // Ctrl+` opens and closes the comments (the match chat). Like the boss key it
  // fires from the comment box too, so the panel can be shut mid-message.
  if (event.ctrlKey && !event.altKey && !event.shiftKey && !event.metaKey && event.code === 'Backquote') {
    if (!getDisguised() || foreignModalOpen()) return;
    event.preventDefault();
    toggleSheetComments();
    return;
  }

  if (!(event.ctrlKey || event.metaKey) || isEditableTarget(event.target) || foreignModalOpen()) return;
  const key = event.key.toLowerCase();
  const code = event.code;
  const actions = sheetActionsStore.get();

  if (event.altKey) {
    // Matched on the physical key: Ctrl+Alt is AltGr on many layouts, which
    // changes event.key.
    if (code === 'KeyM') {
      event.preventDefault();
      toggleSheetComments();
    }
    return;
  }

  if (key === 'z' && !event.shiftKey) {
    // Without a take-back to offer, Ctrl+Z is left to the browser.
    if (!actions.undo) return;
    event.preventDefault();
    sheetUndo();
  } else if (key === 'y' || (key === 'z' && event.shiftKey)) {
    if (!actions.rematch) return;
    event.preventDefault();
    sheetRematch();
  } else if (key === '-' || key === '_' || code === 'Minus' || code === 'NumpadSubtract') {
    // The board is sized here instead of letting the browser zoom the page.
    event.preventDefault();
    stepSheetZoom(-1);
  } else if (key === '=' || key === '+' || code === 'Equal' || code === 'NumpadAdd') {
    event.preventDefault();
    stepSheetZoom(1);
  } else if (code === 'Digit0' || code === 'Numpad0') {
    event.preventDefault();
    setSheetZoom(1);
  } else if (key === '/' || code === 'Slash') {
    event.preventDefault();
    updateSheetUi({ helpOpen: !ui.helpOpen });
  } else if (key === 'f' && event.shiftKey) {
    event.preventDefault();
    toggleCompact();
  }
};

/* ---------------------------------- menus --------------------------------- */

interface MenuState {
  actions: ReturnType<typeof useSheetActions>;
  markLastMove: boolean;
  soundEnabled: boolean;
  zoom: number;
  disguised: boolean;
  onToggleDisguise: () => void;
  simulationCount: number;
}

/** "Sheets wording (what it really does)", the accessible name pattern. */
const spoken = (sheetsLabel: string, real: string) => `${sheetsLabel} (${real})`;

const buildMenus = ({
  actions,
  markLastMove,
  soundEnabled,
  zoom,
  disguised,
  onToggleDisguise,
  simulationCount,
}: MenuState): SheetMenuDef[] => {
  const { rematch, takeSeat, share, resign, exit, undo } = actions;

  const fileItems: SheetMenuItem[] = [
    {
      kind: 'item',
      label: 'Mới',
      // The real action's name is spoken only. A tooltip is something a
      // bystander can read, so it stays out of one.
      ariaLabel: spoken('Mới', rematch?.label || 'ván mới'),
      disabled: !isActionReady(rematch),
      onSelect: sheetRematch,
    },
  ];
  if (takeSeat) {
    fileItems.push({
      kind: 'item',
      label: 'Yêu cầu quyền chỉnh sửa',
      ariaLabel: spoken('Yêu cầu quyền chỉnh sửa', takeSeat.label || 'vào ghế chơi'),
      disabled: !isActionReady(takeSeat),
      onSelect: sheetTakeSeat,
    });
  }
  fileItems.push(
    {
      kind: 'item',
      label: 'Chia sẻ',
      ariaLabel: spoken('Chia sẻ', share ? 'sao chép đường liên kết mời vào phòng' : 'chưa có phòng để mời'),
      onSelect: sheetShare,
    },
    decorative('Tạo bản sao'),
    decorative('Tải xuống'),
    SEPARATOR,
    {
      kind: 'item',
      label: 'Cài đặt bảng tính',
      ariaLabel: spoken('Cài đặt bảng tính', 'mở cài đặt trò chơi'),
      onSelect: openSheetSettings,
    },
    SEPARATOR,
    {
      kind: 'item',
      label: 'Chuyển vào thùng rác',
      ariaLabel: spoken('Chuyển vào thùng rác', resign?.label || 'đầu hàng'),
      disabled: !isActionReady(resign),
      onSelect: sheetResign,
    },
    {
      kind: 'item',
      label: 'Đóng',
      ariaLabel: spoken('Đóng', exit?.label || 'rời ván'),
      disabled: !isActionReady(exit),
      onSelect: sheetExit,
    },
  );

  const zoomItems: SheetMenuItem[] = SHEET_ZOOM_STEPS.map((step) => ({
    kind: 'item',
    label: `Thu phóng ${Math.round(step * 100)}%`,
    checked: Math.abs(zoom - step) < 1e-6,
    onSelect: () => setSheetZoom(step),
  }));

  return [
    { id: 'file', label: 'Tệp', items: fileItems },
    {
      id: 'edit',
      label: 'Chỉnh sửa',
      items: [
        {
          kind: 'item',
          label: 'Hoàn tác',
          shortcut: 'Ctrl+Z',
          ariaLabel: spoken('Hoàn tác', undo?.label || 'xin đi lại nước vừa đánh'),
          disabled: !isActionReady(undo),
          onSelect: sheetUndo,
        },
        {
          kind: 'item',
          label: 'Làm lại',
          shortcut: 'Ctrl+Y',
          ariaLabel: spoken('Làm lại', rematch?.label || 'ván mới hoặc tái đấu'),
          disabled: !isActionReady(rematch),
          onSelect: sheetRematch,
        },
        SEPARATOR,
        decorative('Cắt', 'Ctrl+X'),
        decorative('Sao chép', 'Ctrl+C'),
        decorative('Dán', 'Ctrl+V'),
        SEPARATOR,
        {
          kind: 'item',
          label: 'Xóa giá trị nháp',
          ariaLabel: spoken('Xóa giá trị nháp', 'xóa các nước nháp đặt bằng chuột phải'),
          disabled: simulationCount === 0,
          onSelect: clearSheetSketches,
        },
      ],
    },
    {
      id: 'view',
      label: 'Xem',
      items: [
        {
          kind: 'item',
          label: 'Đánh dấu ô vừa nhập',
          checked: markLastMove,
          ariaLabel: spoken('Đánh dấu ô vừa nhập', 'đánh dấu nước vừa đi'),
          onSelect: () => setDisplayPref('markLastMove', !markLastMove),
        },
        SEPARATOR,
        ...zoomItems,
        {
          kind: 'item',
          label: 'Căn giữa trang tính',
          ariaLabel: spoken('Căn giữa trang tính', 'căn giữa bàn cờ'),
          onSelect: centerSheetBoard,
        },
        SEPARATOR,
        {
          kind: 'item',
          label: 'Chế độ toàn màn hình',
          checked: disguised,
          ariaLabel: spoken('Chế độ toàn màn hình', disguised ? 'hiện lại giao diện trò chơi' : 'ngụy trang thành trang tính'),
          onSelect: onToggleDisguise,
        },
      ],
    },
    {
      id: 'insert',
      label: 'Chèn',
      items: [
        decorative('Ô'),
        decorative('Hàng'),
        decorative('Cột'),
        decorative('Trang tính', 'Shift+F11'),
        SEPARATOR,
        decorative('Biểu đồ'),
        decorative('Hình ảnh'),
        SEPARATOR,
        {
          kind: 'item',
          label: 'Nhận xét',
          shortcut: 'Ctrl+Alt+M',
          ariaLabel: spoken('Nhận xét', 'mở hoặc đóng trò chuyện'),
          onSelect: toggleSheetComments,
        },
      ],
    },
    {
      id: 'format',
      label: 'Định dạng',
      items: [
        decorative('Giao diện'),
        decorative('Số'),
        decorative('Văn bản'),
        decorative('Căn chỉnh'),
        SEPARATOR,
        decorative('Định dạng có điều kiện'),
        decorative('Màu xen kẽ'),
      ],
    },
    {
      id: 'data',
      label: 'Dữ liệu',
      items: [
        decorative('Sắp xếp trang tính'),
        decorative('Sắp xếp dải ô'),
        decorative('Tạo bộ lọc'),
        SEPARATOR,
        decorative('Xác thực dữ liệu'),
        decorative('Dọn dẹp dữ liệu'),
      ],
    },
    {
      id: 'tools',
      label: 'Công cụ',
      items: [
        {
          kind: 'item',
          label: 'Thông báo âm thanh',
          checked: soundEnabled,
          ariaLabel: spoken('Thông báo âm thanh', 'âm thanh trò chơi'),
          onSelect: () => setDisplayPref('soundEnabled', !soundEnabled),
        },
        SEPARATOR,
        decorative('Chính tả'),
        decorative('Bật tính năng tự động hoàn thành'),
        decorative('Hỗ trợ tiếp cận'),
      ],
    },
    {
      id: 'extensions',
      label: 'Tiện ích mở rộng',
      items: [decorative('Tiện ích bổ sung'), decorative('Macro'), decorative('Trình chỉnh sửa tập lệnh')],
    },
    {
      id: 'help',
      label: 'Trợ giúp',
      items: [
        decorative('Trợ giúp về Trang tính'),
        decorative('Đào tạo'),
        decorative('Nội dung cập nhật'),
        SEPARATOR,
        {
          kind: 'item',
          label: 'Phím tắt',
          shortcut: 'Ctrl+/',
          ariaLabel: spoken('Phím tắt', 'cách chơi khi ngụy trang'),
          onSelect: openSheetHelp,
        },
      ],
    },
  ];
};

/* --------------------------------- chrome --------------------------------- */

interface SheetChromeProps {
  board: BoardMatrix;
  /** Hovered cell, else the last move; drives the name box and formula bar. */
  activeCell: { row: number; col: number } | null;
  /** True once everything but the Sheets shell has been unmounted. */
  disguised: boolean;
  /** Flips disguise mode: the star, and Xem > Chế độ toàn màn hình. */
  onToggleDisguise: () => void;
  /** Locally sketched (right-click) moves, for "Xóa giá trị nháp". */
  simulationCount: number;
}

/**
 * Memoised, with Board passing a cell object that only changes when the
 * pointer reaches a different cell, so hovering across a 50x50 board does not
 * re-render the whole header on every step. Inside, the menus and the
 * toolbar and top bar are memoised too, so a hover only redraws the formula
 * bar.
 */
export const SheetChrome = memo(({
  board,
  activeCell,
  disguised,
  onToggleDisguise,
  simulationCount,
}: SheetChromeProps) => {
  const actions = useSheetActions();
  const ui = useSheetUi();
  const prefs = useDisplayPrefs();
  const reportCell = useReportCell();
  // Sheets' "hide the menus" mode: just the toolbar and formula bar.
  const [compact, setCompact] = useState(false);

  useEffect(() => {
    const toggleCompact = () => setCompact((value) => !value);
    const onKeyDown = (event: KeyboardEvent) => handleSheetKey(event, toggleCompact);
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // A request that has just gone out (take-back, rematch, seat) is announced
  // once, the way Sheets confirms an action, rather than on every render.
  // Only while disguised: peeking at the real game UI, its own rail already
  // shows the request as pending. The previous value is still recorded, so a
  // request sent while peeking is not announced later on the way back in.
  const pendingSignature = [actions.undo, actions.rematch, actions.takeSeat, actions.resign]
    .map((action) => (action?.pending ? '1' : '0'))
    .join('');
  const previousPending = useRef(pendingSignature);
  useEffect(() => {
    const before = previousPending.current;
    previousPending.current = pendingSignature;
    if (!disguised) return;
    if ([...pendingSignature].some((flag, i) => flag === '1' && before[i] !== '1')) showSheetSnackbar(PENDING_TEXT);
  }, [pendingSignature, disguised]);

  const { markLastMove, soundEnabled } = prefs;
  const zoom = ui.zoom;
  const menus = useMemo(
    () => buildMenus({ actions, markLastMove, soundEnabled, zoom, disguised, onToggleDisguise, simulationCount }),
    [actions, markLastMove, soundEnabled, zoom, disguised, onToggleDisguise, simulationCount],
  );
  const toggleCompact = useCallback(() => setCompact((value) => !value), []);

  const inReport = ui.view !== 'game';
  const cellRef = inReport
    ? reportCell?.ref ?? 'A1'
    : activeCell
      ? `${columnLabel(activeCell.col)}${activeCell.row + 1}`
      : 'A1';
  const formulaText = inReport
    ? reportCell?.text ?? ''
    : fakeCellText(
        activeCell?.row ?? 0,
        activeCell?.col ?? 0,
        activeCell ? board[activeCell.row]?.[activeCell.col] ?? null : null,
      );

  return (
    <div className="flex w-full shrink-0 flex-col bg-white text-[#202124]" style={{ fontFamily: CHROME_FONT }}>
      {!compact && <SheetTopBar disguised={disguised} onToggleDisguise={onToggleDisguise} menus={menus} />}
      <div className={compact ? 'pt-2' : 'pt-1'}>
        <SheetToolbar compact={compact} onToggleCompact={toggleCompact} />
      </div>

      {/* Formula bar: the name box and the "content" of the cell under the
          pointer. Read-only scenery, so it stays out of the a11y tree. */}
      <div aria-hidden="true" className="flex h-7 shrink-0 items-center border-y border-[#e0e0e0] text-[13px] select-none">
        <div className="flex h-full w-[90px] shrink-0 items-center justify-between border-r border-[#e0e0e0] pr-1.5 pl-2.5 text-[#202124]">
          <span className="truncate">{cellRef}</span>
          <ChevronDown size={12} strokeWidth={2.4} className="shrink-0 text-[#444746]" />
        </div>
        <span className="px-3 font-serif text-[15px] text-[#5f6368] italic">fx</span>
        <span className="h-4 w-px shrink-0 bg-[#e0e0e0]" />
        <span className="min-w-0 flex-1 truncate px-2 text-[13px] text-[#202124]" style={{ fontFamily: CELL_FONT }}>
          {formulaText}
        </span>
      </div>

      <SheetSnackbar />
      {ui.helpOpen && <SheetHelpDialog />}
    </div>
  );
});

SheetChrome.displayName = 'SheetChrome';
