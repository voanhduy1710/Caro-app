import React, { memo, useState } from 'react';
import {
  AlignLeft,
  ArrowDownToLine,
  Bold,
  ChartColumn,
  ChevronDown,
  ChevronUp,
  Funnel,
  Grid2x2,
  Italic,
  Link,
  ListFilter,
  MessageSquarePlus,
  Minus,
  PaintBucket,
  PaintRoller,
  Plus,
  Printer,
  Redo2,
  RotateCcwSquare,
  Search,
  Sigma,
  Strikethrough,
  TableCellsMerge,
  Undo2,
  WrapText,
} from 'lucide-react';
import { SHEET_ZOOM_STEPS, stepSheetZoom, useSheetActions, useSheetUi } from '../sheetBridge';
import { isActionReady } from './runAction';
import { SheetDropdownButton } from './SheetMenus';
import type { SheetMenuItem } from './menuTypes';
import { DecimalGlyph, TextColorGlyph } from './icons';
import {
  centerSheetBoard,
  setSheetZoom,
  sheetRematch,
  sheetUndo,
  toggleSheetComments,
} from './sheetCommands';
import { CHROME_FONT, HIDDEN_SCROLLBAR } from './sheetStyle';

/**
 * The Sheets toolbar, in the real product's order. The owner's ask was that
 * the game's own controls live here, so a disguised player never has to leave
 * the spreadsheet: Undo takes a move back, Redo starts the next game, the zoom
 * and font-size controls size the board, align centres it and the comment
 * button opens the chat. Everything else is scenery that only looks pressed.
 */

const ICON = { size: 18, strokeWidth: 1.9 } as const;

const BUTTON =
  'grid h-7 min-w-7 shrink-0 place-items-center rounded px-1 text-[#444746] outline-none hover:bg-[rgba(68,71,70,0.08)] focus-visible:ring-2 focus-visible:ring-[#0b57d0] disabled:cursor-default disabled:opacity-[0.38] disabled:hover:bg-transparent';
const PRESSED = 'bg-[#d3e3fd]! text-[#041e49]!';

const Divider: React.FC = () => <span aria-hidden="true" className="mx-[5px] h-[18px] w-px shrink-0 bg-[#c4c7c5]" />;

const Caret: React.FC = () => <ChevronDown size={12} strokeWidth={2.4} className="-mr-0.5 ml-0.5" aria-hidden="true" />;

interface ToolButtonProps {
  /** Pure Sheets wording: this is what a bystander's hover shows. */
  title: string;
  /** What the control really does, for screen readers. */
  ariaLabel: string;
  onClick: () => void;
  disabled?: boolean;
  pressed?: boolean;
  children: React.ReactNode;
}

/** A toolbar button wired to a real game command. */
const ToolButton: React.FC<ToolButtonProps> = ({ title, ariaLabel, onClick, disabled, pressed, children }) => (
  <button
    type="button"
    title={title}
    aria-label={ariaLabel}
    aria-pressed={pressed}
    disabled={disabled}
    onClick={onClick}
    className={`${BUTTON} ${pressed ? PRESSED : ''}`}
  >
    {children}
  </button>
);

/**
 * Scenery: a button that only ever shows a pressed look. Kept out of the tab
 * order and the accessibility tree, since it changes nothing.
 */
const SceneryButton: React.FC<{ title: string; children: React.ReactNode; toggles?: boolean; className?: string }> = ({
  title,
  children,
  toggles = false,
  className = '',
}) => {
  const [on, setOn] = useState(false);
  return (
    <button
      type="button"
      title={title}
      tabIndex={-1}
      aria-hidden="true"
      onClick={() => toggles && setOn((v) => !v)}
      className={`${BUTTON} ${on ? PRESSED : ''} ${className}`}
    >
      {children}
    </button>
  );
};

interface SheetToolbarProps {
  /** The menus (and title row) are hidden, Sheets' "compact" mode. */
  compact: boolean;
  onToggleCompact: () => void;
}

/** Memoised: SheetChrome re-renders on every hovered cell, this does not need to. */
export const SheetToolbar = memo(({ compact, onToggleCompact }: SheetToolbarProps) => {
  const actions = useSheetActions();
  const ui = useSheetUi();
  const zoomPercent = Math.round(ui.zoom * 100);
  // The font-size box tracks the zoom, since − and + are what drive it.
  const fontSize = Math.round(11 * ui.zoom);
  const atMinZoom = ui.zoom <= SHEET_ZOOM_STEPS[0] + 1e-6;
  const atMaxZoom = ui.zoom >= SHEET_ZOOM_STEPS[SHEET_ZOOM_STEPS.length - 1] - 1e-6;

  const zoomItems: SheetMenuItem[] = SHEET_ZOOM_STEPS.map((step) => ({
    kind: 'item',
    label: `${Math.round(step * 100)}%`,
    checked: Math.abs(ui.zoom - step) < 1e-6,
    onSelect: () => setSheetZoom(step),
  }));

  const undo = actions.undo;
  const rematch = actions.rematch;

  return (
    <div
      className="mx-2 mb-1 flex h-[38px] shrink-0 items-center rounded-[20px] bg-[#edf2fa] px-[10px] py-[2px] text-[#444746] select-none sm:mx-[14px]"
      style={{ fontFamily: CHROME_FONT }}
      role="toolbar"
      aria-label="Thanh công cụ"
    >
      <div className={`flex min-w-0 flex-1 items-center overflow-x-auto ${HIDDEN_SCROLLBAR}`}>
        <button
          type="button"
          tabIndex={-1}
          aria-hidden="true"
          title="Trình đơn tìm kiếm (Alt+/)"
          className="flex h-7 shrink-0 items-center gap-1.5 rounded-[14px] px-2 text-[14px] text-[#444746] hover:bg-[rgba(68,71,70,0.08)]"
        >
          <Search {...ICON} size={17} />
          <span className="hidden md:inline">Trình đơn</span>
        </button>
        <Divider />

        <ToolButton
          title="Hoàn tác (Ctrl+Z)"
          ariaLabel={`Hoàn tác (${undo?.label || 'xin đi lại nước vừa đánh'})`}
          onClick={sheetUndo}
          disabled={!isActionReady(undo)}
        >
          <Undo2 {...ICON} />
        </ToolButton>
        <ToolButton
          title="Làm lại (Ctrl+Y)"
          ariaLabel={`Làm lại (${rematch?.label || 'ván mới hoặc tái đấu'})`}
          onClick={sheetRematch}
          disabled={!isActionReady(rematch)}
        >
          <Redo2 {...ICON} />
        </ToolButton>
        <SceneryButton title="In (Ctrl+P)">
          <Printer {...ICON} />
        </SceneryButton>
        <SceneryButton title="Định dạng bằng công cụ sao chép định dạng" toggles>
          <PaintRoller {...ICON} />
        </SceneryButton>
        <Divider />

        <SheetDropdownButton
          items={zoomItems}
          title="Thu phóng"
          ariaLabel={`Thu phóng (cỡ bàn cờ, hiện tại ${zoomPercent}%)`}
          className={`${BUTTON} flex! gap-0 px-1.5! text-[14px] text-[#444746]`}
          minWidth={120}
        >
          <span className="tabular-nums">{zoomPercent}%</span>
          <Caret />
        </SheetDropdownButton>
        <Divider />

        <SceneryButton title="Định dạng dưới dạng tiền tệ">
          <span className="text-[15px] leading-none">đ</span>
        </SceneryButton>
        <SceneryButton title="Định dạng dưới dạng phần trăm">
          <span className="text-[15px] leading-none">%</span>
        </SceneryButton>
        <SceneryButton title="Giảm số chữ số thập phân">
          <DecimalGlyph />
        </SceneryButton>
        <SceneryButton title="Tăng số chữ số thập phân">
          <DecimalGlyph more />
        </SceneryButton>
        <SceneryButton title="Định dạng khác" className="flex! px-1.5!">
          <span className="text-[13px] leading-none">123</span>
          <Caret />
        </SceneryButton>
        <Divider />

        <SceneryButton title="Phông chữ" className="flex! w-[118px] justify-between px-2!">
          <span className="truncate text-[14px] leading-none">Mặc định (Ari...</span>
          <Caret />
        </SceneryButton>
        <Divider />

        <ToolButton
          title="Giảm cỡ chữ (Ctrl+Shift+,)"
          ariaLabel="Giảm cỡ chữ (thu nhỏ bàn cờ)"
          onClick={() => stepSheetZoom(-1)}
          disabled={atMinZoom}
        >
          <Minus {...ICON} size={16} />
        </ToolButton>
        <span
          aria-hidden="true"
          title="Cỡ chữ"
          className="mx-0.5 grid h-6 w-[34px] shrink-0 place-items-center rounded border border-[#747775] bg-transparent text-[14px] text-[#1f1f1f] tabular-nums"
        >
          {fontSize}
        </span>
        <ToolButton
          title="Tăng cỡ chữ (Ctrl+Shift+.)"
          ariaLabel="Tăng cỡ chữ (phóng to bàn cờ)"
          onClick={() => stepSheetZoom(1)}
          disabled={atMaxZoom}
        >
          <Plus {...ICON} size={16} />
        </ToolButton>
        <Divider />

        <SceneryButton title="Đậm (Ctrl+B)" toggles>
          <Bold {...ICON} strokeWidth={2.6} />
        </SceneryButton>
        <SceneryButton title="Nghiêng (Ctrl+I)" toggles>
          <Italic {...ICON} />
        </SceneryButton>
        <SceneryButton title="Gạch ngang chữ (Alt+Shift+5)" toggles>
          <Strikethrough {...ICON} />
        </SceneryButton>
        <SceneryButton title="Màu văn bản">
          <TextColorGlyph />
        </SceneryButton>
        <Divider />

        <SceneryButton title="Màu tô">
          <PaintBucket {...ICON} />
        </SceneryButton>
        <SceneryButton title="Đường viền">
          <Grid2x2 {...ICON} />
        </SceneryButton>
        <SceneryButton title="Hợp nhất ô" className="flex! px-1!">
          <TableCellsMerge {...ICON} />
          <Caret />
        </SceneryButton>
        <Divider />

        <ToolButton title="Căn chỉnh ngang" ariaLabel="Căn chỉnh ngang (căn giữa bàn cờ)" onClick={centerSheetBoard}>
          <span className="flex items-center">
            <AlignLeft {...ICON} />
            <Caret />
          </span>
        </ToolButton>
        <SceneryButton title="Căn chỉnh dọc" className="flex! px-1!">
          <ArrowDownToLine {...ICON} />
          <Caret />
        </SceneryButton>
        <SceneryButton title="Xuống dòng tự động" className="flex! px-1!">
          <WrapText {...ICON} />
          <Caret />
        </SceneryButton>
        <SceneryButton title="Xoay văn bản" className="flex! px-1!">
          <RotateCcwSquare {...ICON} />
          <Caret />
        </SceneryButton>
        <Divider />

        <SceneryButton title="Chèn đường liên kết (Ctrl+K)">
          <Link {...ICON} />
        </SceneryButton>
        <ToolButton
          title="Chèn nhận xét (Ctrl+Alt+M)"
          ariaLabel={ui.commentsOpen ? 'Chèn nhận xét (đóng trò chuyện)' : 'Chèn nhận xét (mở trò chuyện)'}
          onClick={toggleSheetComments}
          pressed={ui.commentsOpen}
        >
          <MessageSquarePlus {...ICON} />
        </ToolButton>
        <SceneryButton title="Chèn biểu đồ">
          <ChartColumn {...ICON} />
        </SceneryButton>
        <SceneryButton title="Tạo bộ lọc" toggles>
          <Funnel {...ICON} />
        </SceneryButton>
        <SceneryButton title="Chế độ xem bộ lọc" className="flex! px-1!">
          <ListFilter {...ICON} />
          <Caret />
        </SceneryButton>
        <Divider />

        <SceneryButton title="Hàm" className="flex! px-1!">
          <Sigma {...ICON} />
          <Caret />
        </SceneryButton>
      </div>

      <button
        type="button"
        title={compact ? 'Hiện trình đơn (Ctrl+Shift+F)' : 'Ẩn trình đơn (Ctrl+Shift+F)'}
        aria-label={compact ? 'Hiện trình đơn và thanh tiêu đề' : 'Ẩn trình đơn và thanh tiêu đề'}
        aria-expanded={!compact}
        onClick={onToggleCompact}
        className={`${BUTTON} ml-1 rounded-full`}
      >
        {compact ? <ChevronDown {...ICON} /> : <ChevronUp {...ICON} />}
      </button>
    </div>
  );
});

SheetToolbar.displayName = 'SheetToolbar';
