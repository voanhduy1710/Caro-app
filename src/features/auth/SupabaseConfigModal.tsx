import React, { useState, useCallback } from 'react';
import { X, AlertTriangle } from 'lucide-react';
import { useAuth } from './AuthContext';
import { useModalChrome } from '../../shared/hooks/useModalChrome';

export const SupabaseConfigModal: React.FC = () => {
  const { showConfigGuide, setShowConfigGuide, authError, setAuthError, loginAsGuest } = useAuth();
  const [customName, setCustomName] = useState('');
  const handleClose = useCallback(() => {
    setShowConfigGuide(false);
    setAuthError(null);
  }, [setShowConfigGuide, setAuthError]);
  const dialogProps = useModalChrome(showConfigGuide, handleClose, 'supabase-config-modal-title');

  if (!showConfigGuide) return null;

  const handleCustomLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (customName.trim()) {
      loginAsGuest(customName.trim());
      handleClose();
    }
  };

  return (
    <div
      {...dialogProps}
      className="modal-scrim"
    >
      <div className="modal-panel max-w-lg relative p-6 space-y-4">
        <button
          onClick={handleClose}
          className="btn btn-ghost btn-icon absolute top-4 right-4"
         aria-label="Close">
            <X size={18} strokeWidth={2.25} aria-hidden="true" />
          </button>

        <div className="border-b-2 border-line pb-3">
          <h2 id="supabase-config-modal-title" className="text-lg font-semibold text-ink tracking-tight mt-0.5">
            Google Authentication Configuration
          </h2>
        </div>

        {authError && (
          <div className="bg-warning-soft border border-warning p-3 rounded-md text-warning text-xs font-medium space-y-1">
            <div className="font-medium flex items-center gap-1.5 text-warning">
              <AlertTriangle size={13} strokeWidth={2.25} className="shrink-0" aria-hidden="true" />{authError}
            </div>
            <p className="text-[11px]">
              Google Provider is not toggled ON in your Supabase Dashboard for project <code className="font-mono bg-warning-soft px-1 rounded-sm">deuuuibkqletkkbrsmxd</code>.
            </p>
          </div>
        )}

        {/* Quick Custom Name Login Fallback */}
        <div className="p-3 bg-accent-soft border border-accent rounded-md space-y-2">
          <div className="text-xs font-medium text-accent-text">Quick Login with Custom Name</div>
          <p className="text-[11px] text-accent-text">
            Set your display name to play immediately while Google OAuth is being configured:
          </p>
          <form onSubmit={handleCustomLogin} className="flex gap-2">
            <input
              type="text"
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              placeholder="Your Player Name..."
              className="flex-1 bg-surface border border-accent rounded-sm px-3 py-1.5 text-xs text-ink focus:outline-none focus:border-accent font-medium"
            />
            <button
              type="submit"
              disabled={!customName.trim()}
              className="btn btn-primary btn-sm"
            >
              Play Now
            </button>
          </form>
        </div>

        <div className="space-y-3 text-xs text-muted border-t-2 border-line pt-3">
          <p className="font-medium text-ink">
            Steps to enable Google 1-Click Authentication:
          </p>

          <ol className="list-decimal list-inside space-y-1.5 text-[11px] text-muted font-sans leading-relaxed">
            <li>
              Open{' '}
              <a
                href="https://supabase.com/dashboard/project/deuuuibkqletkkbrsmxd/auth/providers"
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent-text underline font-medium hover:text-accent-text"
              >
                Supabase Auth Providers Dashboard (deuuuibkqletkkbrsmxd)
              </a>.
            </li>
            <li>
              Find <strong>Google</strong> under Auth Providers and click <strong>Enable</strong>.
            </li>
            <li>
              Paste your <strong>Client ID</strong> and <strong>Client Secret</strong> from Google Cloud Console.
            </li>
            <li>
              Save changes. Google Sign-In will start working immediately.
            </li>
          </ol>
        </div>

        <button
          onClick={handleClose}
          className="btn btn-secondary btn-lg w-full"
        >
          Close
        </button>
      </div>
    </div>
  );
};
