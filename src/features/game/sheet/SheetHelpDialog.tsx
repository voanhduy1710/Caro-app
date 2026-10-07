import React, { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { updateSheetUi } from '../sheetBridge';
import { CHROME_FONT, DIALOG_SHADOW } from './sheetStyle';

/**
 * Trợ giúp > Phím tắt. Styled as Sheets' own shortcuts dialog, so even this
 * page reads as office software, but it is the one place that spells out what
 * every disguised control really does in the game.
 */
const SHORTCUTS: Array<[keys: string[], meaning: string]> = [
  [['Esc'], 'Chuyển ngay sang trang báo cáo giả và quay lại'],
  [['Ctrl', 'Z'], 'Hoàn tác nước đi (xin đi lại)'],
  [['Ctrl', 'Y'], 'Làm lại: ván mới / tái đấu'],
  [['Ctrl', '+'], 'Phóng to bàn cờ'],
  [['Ctrl', '-'], 'Thu nhỏ bàn cờ'],
  [['Ctrl', '0'], 'Thu phóng về 100%'],
  [['Ctrl', 'Alt', 'M'], 'Mở hoặc đóng nhận xét (trò chuyện)'],
  [['Ctrl', '/'], 'Mở bảng phím tắt này'],
];

const CONTROLS: Array<[control: string, meaning: string]> = [
  ['Ngôi sao cạnh tên tệp', 'Hiện lại giao diện game, bấm lần nữa để ngụy trang'],
  ['Biểu tượng trang tính (góc trái)', 'Rời phòng / thoát ván'],
  ['Nút Hoàn tác / Làm lại', 'Xin đi lại / ván mới, tái đấu'],
  ['Căn chỉnh ngang', 'Căn giữa bàn cờ'],
  ['Nhận xét', 'Trò chuyện với đối thủ'],
  ['Chia sẻ', 'Sao chép đường liên kết mời vào phòng'],
  ['Tệp > Chuyển vào thùng rác', 'Đầu hàng'],
  ['Tab dưới cùng', 'Chuyển trang tính: bàn cờ hoặc báo cáo giả'],
  ['Ảnh đại diện góc phải', 'Người có viền là người đang tới lượt'],
];

const Key: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <kbd className="inline-flex h-6 min-w-6 items-center justify-center rounded border border-[#dadce0] bg-[#f8f9fa] px-1.5 font-sans text-[12px] text-[#3c4043]">
    {children}
  </kbd>
);

export const SheetHelpDialog: React.FC = () => {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const close = () => updateSheetUi({ helpOpen: false });

  // Focus moves into the dialog and back to wherever it was on close.
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    return () => previous?.focus?.();
  }, []);

  return createPortal(
    <div
      className="fixed inset-0 z-[1050] flex items-center justify-center bg-[rgba(32,33,36,0.6)] p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close();
      }}
      style={{ fontFamily: CHROME_FONT }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-sheet-dialog="help"
        className="flex max-h-[calc(100vh-32px)] w-full max-w-[600px] flex-col rounded-lg bg-white"
        style={{ boxShadow: DIALOG_SHADOW }}
      >
        <div className="flex items-start justify-between px-6 pt-6 pb-3">
          <h2 id={titleId} className="text-[22px] leading-7 font-normal text-[#202124]">
            Phím tắt
          </h2>
          <button
            type="button"
            onClick={close}
            title="Đóng"
            aria-label="Đóng"
            tabIndex={-1}
            className="-mt-1 -mr-2 grid h-9 w-9 place-items-center rounded-full text-[#444746] hover:bg-[#f1f3f4]"
          >
            <X size={20} aria-hidden="true" />
          </button>
        </div>
        <div className="min-h-0 overflow-y-auto px-6 text-[14px] text-[#5f6368]">
          <table className="w-full border-collapse">
            <tbody>
              {SHORTCUTS.map(([keys, meaning]) => (
                <tr key={meaning} className="border-b border-[#f1f3f4]">
                  <td className="py-2 pr-4 align-middle whitespace-nowrap">
                    <span className="inline-flex items-center gap-1">
                      {keys.map((key, i) => (
                        <React.Fragment key={key}>
                          {i > 0 && <span className="text-[12px]">+</span>}
                          <Key>{key}</Key>
                        </React.Fragment>
                      ))}
                    </span>
                  </td>
                  <td className="py-2 text-[#202124]">{meaning}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-5 mb-1 text-[12px] font-medium tracking-wide text-[#5f6368] uppercase">Nút trên trang tính</p>
          <table className="w-full border-collapse">
            <tbody>
              {CONTROLS.map(([control, meaning]) => (
                <tr key={control} className="border-b border-[#f1f3f4] last:border-0">
                  <td className="py-2 pr-4 align-top text-[#3c4043]">{control}</td>
                  <td className="py-2 text-[#202124]">{meaning}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex justify-end gap-2 px-6 pt-4 pb-5">
          <button
            ref={closeRef}
            type="button"
            onClick={close}
            className="h-9 rounded-[20px] bg-[#0b57d0] px-6 text-[14px] font-medium text-white outline-none hover:bg-[#0a4fbd] hover:shadow focus-visible:ring-2 focus-visible:ring-[#0b57d0] focus-visible:ring-offset-2"
          >
            Đã hiểu
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};
