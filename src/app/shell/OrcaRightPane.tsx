import React from 'react';
import { createPortal } from 'react-dom';
import { useOrcaShell } from './orcaShellContext';

/** Renders `children` at the shell's right edge (desktop pane slot), or nothing outside the Orca shell. */
export const OrcaRightPane: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const shell = useOrcaShell();
  if (!shell?.rightPaneTarget) return null;
  return createPortal(children, shell.rightPaneTarget);
};
