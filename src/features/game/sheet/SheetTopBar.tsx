import React, { memo, useRef, useState } from 'react';
import { CloudCheck, FolderInput, Globe, History, Lock, MessageSquareText, Star, Video } from 'lucide-react';
import { useTheme } from '../../theme/ThemeContext';
import {
  DEFAULT_SHEET_TITLE,
  updateSheetUi,
  useSheetActions,
  useSheetChat,
  useSheetMatch,
  useSheetUi,
  type SheetSeat,
} from '../sheetBridge';
import { SheetLogo } from './icons';
import type { SheetMenuDef } from './menuTypes';
import { SheetMenuBar } from './SheetMenus';
import { isActionReady } from './runAction';
import { sheetExit, sheetShare, toggleSheetComments } from './sheetCommands';
import { SHEETS_GREEN } from './sheetStyle';

/**
 * The document header: file icon, editable name, star, saved state and the
 * menu bar on the left; history, comments, Meet, the people "editing" the
 * file and Share on the right. The editors are the seats, so the ring around
 * one of them is how a disguised player sees whose turn it is.
 */

const ROUND =
  'grid h-8 w-8 shrink-0 place-items-center rounded-full text-[#444746] outline-none hover:bg-[rgba(68,71,70,0.08)] focus-visible:ring-2 focus-visible:ring-[#0b57d0]';

const initialOf = (name: string) => (Array.from(name.trim())[0] ?? '?').toLocaleUpperCase('vi');

/** The document name: always an input, like Sheets, outlined on hover. */
const TitleInput: React.FC = () => {
  const { title } = useSheetUi();
  // Null while not editing, so a rename from elsewhere shows straight away.
  const [draft, setDraft] = useState<string | null>(null);
  const cancelled = useRef(false);
  const value = draft ?? title;

  return (
    <span className="inline-grid min-w-0 max-w-full">
      {/* Invisible twin that sizes the input to its text. */}
      <span aria-hidden="true" className="invisible col-start-1 row-start-1 overflow-hidden border border-transparent px-[6px] text-[18px] leading-6 whitespace-pre">
        {value || ' '}
      </span>
      <input
        value={value}
        maxLength={80}
        spellCheck={false}
        title="Đổi tên"
        aria-label="Tên tài liệu"
        onFocus={(event) => {
          cancelled.current = false;
          setDraft(title);
          event.currentTarget.select();
        }}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            event.currentTarget.blur();
          } else if (event.key === 'Escape') {
            // Cancels the rename; marked handled so the boss key ignores it.
            event.preventDefault();
            cancelled.current = true;
            event.currentTarget.blur();
          }
        }}
        onBlur={() => {
          if (!cancelled.current && draft !== null) updateSheetUi({ title: draft.trim() || DEFAULT_SHEET_TITLE });
          setDraft(null);
        }}
        className="col-start-1 row-start-1 w-full min-w-0 truncate rounded border border-transparent bg-transparent px-[5px] text-[18px] leading-6 text-[#1f1f1f] outline-none hover:border-[#dadce0] focus:border-[#0b57d0] focus:ring-1 focus:ring-[#0b57d0]"
      />
    </span>
  );
};

/** One "editor" of the file: a seat, coloured by its piece. */
const PresenceAvatar: React.FC<{ seat: SheetSeat; color: string }> = ({ seat, color }) => {
  const spoken = `${seat.name}${seat.isTurn ? ', đang tới lượt' : ''}`;
  return (
    <span
      role="img"
      aria-label={spoken}
      title={seat.isTurn ? `${seat.name} đang chỉnh sửa` : seat.name}
      // Only the seat whose turn it is survives on a phone: it is the one
      // piece of game state the header has to keep showing.
      className={`${seat.isTurn ? 'grid' : 'hidden sm:grid'} h-7 w-7 shrink-0 place-items-center rounded-full text-[13px] font-medium text-white select-none`}
      style={{
        background: color,
        boxShadow: seat.isTurn ? `0 0 0 2px #fff, 0 0 0 4px ${color}` : undefined,
        fontFamily: 'Roboto, Arial, sans-serif',
      }}
    >
      {initialOf(seat.name)}
    </span>
  );
};

interface SheetTopBarProps {
  disguised: boolean;
  onToggleDisguise: () => void;
  menus: SheetMenuDef[];
}

/** Memoised: SheetChrome re-renders on every hovered cell, this does not need to. */
export const SheetTopBar = memo(({ disguised, onToggleDisguise, menus }: SheetTopBarProps) => {
  const { theme } = useTheme();
  const ui = useSheetUi();
  const chat = useSheetChat();
  const match = useSheetMatch();
  const actions = useSheetActions();

  // Real Sheets never lists you among the other editors, so the player's own
  // seat is the account circle on the far right, not a presence chip too.
  const seats = match?.seats.filter((seat) => !seat.empty && !seat.isMe) ?? [];
  const me = match?.seats.find((seat) => seat.isMe && !seat.empty);
  const myName = me?.name ?? 'Tôi';
  const myTurn = Boolean(me?.isTurn);
  const pieceColor = (piece: SheetSeat['piece']) => (piece === 'X' ? theme.xColor : piece === 'O' ? theme.oColor : '#7c3aed');
  const unread = chat?.unread ?? 0;
  const shared = Boolean(actions.share);
  const exit = actions.exit;

  return (
    <div className="flex shrink-0 items-center border-b border-[#f1f3f4] pt-2 pr-2 pb-1 pl-2 sm:pr-4 sm:pl-[14px]">
      <button
        type="button"
        onClick={sheetExit}
        disabled={!isActionReady(exit)}
        title="Trang chủ Trang tính"
        aria-label={`Trang chủ Trang tính (${exit?.label || 'rời ván / thoát phòng'})`}
        className="grid h-10 w-10 shrink-0 place-items-center self-start rounded-full outline-none hover:bg-[rgba(68,71,70,0.08)] focus-visible:ring-2 focus-visible:ring-[#0b57d0] disabled:cursor-default disabled:hover:bg-transparent"
      >
        <SheetLogo size={32} />
      </button>

      <div className="ml-1 flex min-w-0 flex-1 flex-col">
        <div className="flex h-[26px] min-w-0 items-center gap-0.5">
          <TitleInput />
          <button
            type="button"
            data-testid="sheet-disguise-toggle"
            onClick={onToggleDisguise}
            title="Gắn dấu sao"
            aria-label={disguised ? 'Gắn dấu sao (hiện lại giao diện trò chơi)' : 'Gắn dấu sao (ẩn giao diện trò chơi)'}
            aria-pressed={disguised}
            className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-[#444746] outline-none hover:bg-[rgba(68,71,70,0.08)] focus-visible:ring-2 focus-visible:ring-[#0b57d0]"
          >
            <Star size={17} strokeWidth={1.9} fill={disguised ? '#f4b400' : 'none'} color={disguised ? '#f4b400' : 'currentColor'} />
          </button>
          <button type="button" tabIndex={-1} aria-hidden="true" title="Di chuyển" className="hidden h-7 w-7 shrink-0 place-items-center rounded-full text-[#444746] hover:bg-[rgba(68,71,70,0.08)] sm:grid">
            <FolderInput size={17} strokeWidth={1.9} />
          </button>
          <span aria-hidden="true" title="Đã lưu tất cả thay đổi vào Drive" className="ml-1 flex shrink-0 items-center gap-1.5 text-[12px] text-[#5f6368]">
            <CloudCheck size={17} strokeWidth={1.9} className="text-[#444746]" />
            <span className="hidden md:inline">Đã lưu vào Drive</span>
          </span>
        </div>
        <SheetMenuBar menus={menus} />
      </div>

      <div className="ml-2 flex shrink-0 items-center gap-1 sm:gap-1.5">
        <button type="button" tabIndex={-1} aria-hidden="true" title="Nhật ký phiên bản" className={`${ROUND} hidden! md:grid!`}>
          <History size={20} strokeWidth={1.8} />
        </button>
        <button
          type="button"
          onClick={toggleSheetComments}
          title="Hiện tất cả nhận xét"
          aria-label={`Hiện tất cả nhận xét (trò chuyện${unread ? `, ${unread} tin chưa đọc` : ''})`}
          aria-pressed={ui.commentsOpen}
          className={`${ROUND} relative ${ui.commentsOpen ? 'bg-[#d3e3fd]! text-[#041e49]!' : ''}`}
        >
          <MessageSquareText size={20} strokeWidth={1.8} />
          {unread > 0 && (
            <span
              aria-hidden="true"
              className="absolute -top-0.5 -right-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-[#0b57d0] px-1 text-[10px] leading-none font-medium text-white ring-2 ring-white"
            >
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </button>
        <button
          type="button"
          tabIndex={-1}
          aria-hidden="true"
          title="Tham gia cuộc gọi tại đây hoặc trình bày thẻ này trong cuộc gọi"
          className="hidden h-8 shrink-0 items-center gap-0.5 rounded-full px-1.5 text-[#444746] hover:bg-[rgba(68,71,70,0.08)] md:flex"
        >
          <Video size={20} strokeWidth={1.8} />
        </button>

        {seats.length > 0 && (
          <div className="mx-1 flex items-center gap-2" aria-label="Người đang chỉnh sửa" role="group">
            {seats.map((seat, i) => (
              <PresenceAvatar key={`${seat.piece}-${i}`} seat={seat} color={pieceColor(seat.piece)} />
            ))}
          </div>
        )}

        <button
          type="button"
          onClick={sheetShare}
          title={shared ? 'Chia sẻ' : 'Chia sẻ. Riêng tư, chỉ mình bạn.'}
          aria-label={shared ? 'Chia sẻ (sao chép đường liên kết mời vào phòng)' : 'Chia sẻ (chưa có phòng để mời)'}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#c2e7ff] text-[14px] font-semibold text-[#001d35] outline-none hover:shadow-[0_1px_3px_1px_rgba(0,0,0,.15),0_1px_2px_0_rgba(0,0,0,.3)] focus-visible:ring-2 focus-visible:ring-[#0b57d0] sm:flex sm:w-auto sm:gap-2 sm:rounded-[20px] sm:px-4"
        >
          {shared ? <Globe size={16} strokeWidth={2.2} /> : <Lock size={16} strokeWidth={2.2} />}
          <span className="hidden sm:inline">Chia sẻ</span>
        </button>

        {/* On the player's own turn the account circle takes the ring the
            seat on turn wears, since their own chip is not in the row. */}
        <span
          role="img"
          title={myTurn ? `${myName} đang chỉnh sửa` : `Tài khoản: ${myName}`}
          aria-label={myTurn ? `${myName} (bạn), đang tới lượt` : `${myName} (bạn)`}
          className="ml-1 grid h-8 w-8 shrink-0 place-items-center rounded-full text-[14px] font-medium text-white select-none"
          style={{
            background: SHEETS_GREEN,
            fontFamily: 'Roboto, Arial, sans-serif',
            boxShadow: myTurn ? `0 0 0 2px #fff, 0 0 0 4px ${SHEETS_GREEN}` : undefined,
          }}
        >
          {initialOf(myName)}
        </span>
      </div>
    </div>
  );
});

SheetTopBar.displayName = 'SheetTopBar';
