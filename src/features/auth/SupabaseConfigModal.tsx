import React, { useState, useRef } from 'react';
import { useAuth } from './AuthContext';

export const SupabaseConfigModal: React.FC = () => {
  const { showConfigGuide, setShowConfigGuide, authError, setAuthError, loginAsGuest } = useAuth();
  const [customName, setCustomName] = useState('');
  const backdropRef = useRef<HTMLDivElement>(null);

  if (!showConfigGuide) return null;

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === backdropRef.current) {
      handleClose();
    }
  };

  const handleClose = () => {
    setShowConfigGuide(false);
    setAuthError(null);
  };

  const handleCustomLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (customName.trim()) {
      loginAsGuest(customName.trim());
      handleClose();
    }
  };

  return (
    <div
      ref={backdropRef}
      onClick={handleBackdropClick}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-md transition-opacity"
    >
      <div className="bg-white text-slate-800 w-full max-w-lg rounded-2xl p-6 relative border border-slate-200 space-y-4">
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-700 text-2xl font-bold p-1 leading-none"
        >
          ×
        </button>

        <div className="border-b border-slate-100 pb-3">
          <span className="text-[10px] font-mono font-bold tracking-widest text-emerald-600 uppercase">
            Google OAuth Setup & Fallback
          </span>
          <h2 className="text-lg font-extrabold text-slate-900 tracking-tight mt-0.5">
            Google Authentication Configuration
          </h2>
        </div>

        {authError && (
          <div className="bg-amber-50 border border-amber-200 p-3 rounded-xl text-amber-800 text-xs font-medium space-y-1">
            <div className="font-bold flex items-center gap-1.5 text-amber-900">
              ⚠️ {authError}
            </div>
            <p className="text-[11px]">
              Google Provider is not toggled ON in your Supabase Dashboard for project <code className="font-mono bg-amber-100 px-1 rounded">deuuuibkqletkkbrsmxd</code>.
            </p>
          </div>
        )}

        {/* Quick Custom Name Login Fallback */}
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl space-y-2">
          <div className="text-xs font-bold text-emerald-900">Quick Login with Custom Name</div>
          <p className="text-[11px] text-emerald-700">
            Set your display name to play immediately while Google OAuth is being configured:
          </p>
          <form onSubmit={handleCustomLogin} className="flex gap-2">
            <input
              type="text"
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              placeholder="Your Player Name..."
              className="flex-1 bg-white border border-emerald-300 rounded-lg px-3 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-emerald-600 font-bold"
            />
            <button
              type="submit"
              disabled={!customName.trim()}
              className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-bold transition"
            >
              Play Now
            </button>
          </form>
        </div>

        <div className="space-y-3 text-xs text-slate-600 border-t border-slate-100 pt-3">
          <p className="font-bold text-slate-800">
            Steps to enable Google 1-Click Authentication:
          </p>

          <ol className="list-decimal list-inside space-y-1.5 text-[11px] text-slate-600 font-sans leading-relaxed">
            <li>
              Open{' '}
              <a
                href="https://supabase.com/dashboard/project/deuuuibkqletkkbrsmxd/auth/providers"
                target="_blank"
                rel="noopener noreferrer"
                className="text-emerald-600 underline font-bold hover:text-emerald-700"
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
          className="w-full py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs border border-slate-300 transition"
        >
          Close
        </button>
      </div>
    </div>
  );
};
