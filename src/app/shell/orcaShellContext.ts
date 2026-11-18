import { createContext, useContext } from 'react';
import type { WorkspaceSurface } from './types';

/**
 * What the Orca shell tells the screens inside it. `null` outside the Orca
 * style (the Default layout never provides it), so a component can ask
 * `useOrcaShell()` to learn whether it sits in the Orca workbench at all.
 *
 * Right pane. PR 5 drew the match's chat / roster column (310px, desktop
 * only) inside GameControlsView, next to the board, and that is still the
 * simplest way to match it. For anything that must live at the shell's right
 * edge instead (outside the match stage, e.g. a roster that stays while the
 * board is hidden), the shell keeps an empty slot there: render into it with
 * <OrcaRightPane> (OrcaRightPane.tsx). The slot is `display: contents`, so it takes no room until
 * something is portalled in; give the portalled element its own width,
 * `shrink-0`, `border-l border-line bg-sidebar`, and `hidden lg:flex` if it
 * is desktop-only. Portalled content stays mounted where it is declared in
 * React, so its state survives the slot appearing or the tab changing.
 */
export interface OrcaShellValue {
  /** The workspace tab in front. */
  surface: WorkspaceSurface;
  /** True while the live session tab ('match') is the one in front. */
  matchVisible: boolean;
  /** Left sidebar state, and its toggle (also Ctrl+B). */
  sidebarOpen: boolean;
  toggleSidebar: () => void;
  /** The right-edge slot element, null until the shell has mounted it. */
  rightPaneTarget: HTMLElement | null;
}

export const OrcaShellContext = createContext<OrcaShellValue | null>(null);

/** The Orca shell around this component, or null in the Default style. */
export const useOrcaShell = () => useContext(OrcaShellContext);
