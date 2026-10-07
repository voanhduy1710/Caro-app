/** One row of a Sheets dropdown. */
export type SheetMenuItem =
  | {
      kind: 'item';
      label: string;
      onSelect: () => void;
      /** Right-aligned shortcut hint, e.g. "Ctrl+Z". */
      shortcut?: string;
      disabled?: boolean;
      /** Set for toggles: the item becomes a menuitemcheckbox with a ✓ gutter. */
      checked?: boolean;
      /** Spoken name when the Sheets wording hides what the item really does. */
      ariaLabel?: string;
      title?: string;
    }
  | { kind: 'separator' }
  /** A small grey caption, used to group the folded menus under "Thêm". */
  | { kind: 'header'; label: string };

export interface SheetMenuDef {
  id: string;
  label: string;
  items: SheetMenuItem[];
}

export const SEPARATOR: SheetMenuItem = { kind: 'separator' };

/** A greyed-out item that is only there so the menu looks complete. */
export const decorative = (label: string, shortcut?: string): SheetMenuItem => ({
  kind: 'item',
  label,
  shortcut,
  disabled: true,
  onSelect: () => {},
});
