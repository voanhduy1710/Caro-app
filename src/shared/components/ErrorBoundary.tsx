import React from 'react';
import { clearSavedRooms } from '../../features/webrtc/roomDiscoveryService';

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

/**
 * Keeps something on screen when a render throws.
 *
 * React 19 unmounts the whole root on an uncaught render error, which left the
 * player on a blank page with no way forward. This shows a small panel instead,
 * with a reload and, for a crash that comes back on every load, a reload that
 * first forgets the lobby rooms cached in localStorage. A bad room saved there
 * is the one thing a plain reload would bring straight back.
 *
 * It has to be a class: React still has no hook that catches render errors.
 */
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('The app crashed while rendering:', error, info.componentStack);
  }

  private reload = () => {
    window.location.reload();
  };

  private clearSavedDataAndReload = () => {
    clearSavedRooms();
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="grid min-h-dvh place-items-center p-4">
        <div role="alert" className="panel w-[min(24rem,100%)] p-6 text-center">
          <p className="font-semibold text-ink">Something went wrong while showing this page.</p>
          <div className="mt-5 flex flex-col gap-2">
            <button type="button" onClick={this.reload} className="btn btn-primary">
              Reload
            </button>
            <button type="button" onClick={this.clearSavedDataAndReload} className="btn btn-secondary">
              Clear saved data and reload
            </button>
          </div>
        </div>
      </div>
    );
  }
}
