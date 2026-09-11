import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../auth/AuthContext';
import { getRankTitle } from '../../shared/utils/eloCalculator';
import { AVATAR_ITEMS, getAvatarPublicUrl, getAvatarLocalUrl } from '../avatar/avatarService';

export const ProfileModal: React.FC = () => {
  const { user, showProfileModal, setShowProfileModal, updateUserProfile, changePassword } = useAuth();
  const backdropRef = useRef<HTMLDivElement>(null);

  const [displayName, setDisplayName] = useState('');
  const [selectedPhotoURL, setSelectedPhotoURL] = useState('');
  const [hoveredAvatarFilename, setHoveredAvatarFilename] = useState<string | null>(null);
  const [isSavedSuccess, setIsSavedSuccess] = useState(false);

  // Change Password state
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  useEffect(() => {
    if (user) {
      setDisplayName(user.displayName || '');
      setSelectedPhotoURL(user.photoURL || getAvatarPublicUrl('Zerom.gif'));
    }
  }, [user, showProfileModal]);

  if (!showProfileModal || !user) return null;

  const rank = getRankTitle(user.elo);
  const totalGames = user.wins + user.losses + user.draws;
  const winRate = totalGames > 0 ? Math.round((user.wins / totalGames) * 100) : 0;

  const filteredAvatars = AVATAR_ITEMS;

  // Active preview avatar URL (Hover preview overrides active selection)
  const activeAvatarPreviewUrl = hoveredAvatarFilename
    ? getAvatarLocalUrl(hoveredAvatarFilename)
    : getAvatarPublicUrl(selectedPhotoURL);

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === backdropRef.current) {
      setShowProfileModal(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!displayName.trim()) return;

    await updateUserProfile({
      displayName: displayName.trim(),
      photoURL: selectedPhotoURL,
    });

    setIsSavedSuccess(true);
    setTimeout(() => setIsSavedSuccess(false), 2000);
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(null);

    if (newPassword !== confirmPassword) {
      setPasswordError('Passwords do not match.');
      return;
    }

    setIsChangingPassword(true);
    const res = await changePassword(newPassword);
    setIsChangingPassword(false);

    if (res.success) {
      setPasswordSuccess(res.message || 'Password updated successfully!');
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => setPasswordSuccess(null), 3000);
    } else {
      setPasswordError(res.message || 'Failed to update password.');
    }
  };

  return (
    <div
      ref={backdropRef}
      onClick={handleBackdropClick}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-md transition-opacity"
    >
      <div className="bg-white text-slate-800 w-full max-w-xl rounded-2xl p-4 sm:p-5 relative border border-slate-200 space-y-3 overflow-hidden max-h-[90vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-2 shrink-0">
          <div>
            <span className="text-[9px] font-mono font-bold tracking-widest text-emerald-700 uppercase">
              Player Identity
            </span>
            <h2 className="text-lg font-extrabold text-slate-900 tracking-tight">
              Player Profile & Avatar Settings
            </h2>
          </div>
          <button
            onClick={() => setShowProfileModal(false)}
            className="text-slate-400 hover:text-slate-700 text-xl font-bold p-1 leading-none transition"
          >
            ×
          </button>
        </div>

        <div className="flex-1 overflow-y-auto space-y-3 pr-1">
          {/* Main User Card Header & Interactive Live Hover Preview */}
          <div className="bg-slate-50 border border-slate-200 p-2.5 rounded-xl flex items-center gap-3">
            <div className="relative shrink-0">
              <img
                src={activeAvatarPreviewUrl}
                alt="Selected Avatar"
                onError={(e) => {
                  e.currentTarget.src = '/Avatar/Zerom.gif';
                }}
                className="w-12 h-12 rounded-full border-2 border-emerald-500 bg-white p-0.5 shadow-sm object-contain"
              />
              {hoveredAvatarFilename && (
                <span className="absolute -top-1 -right-1 px-1.5 py-0.5 bg-amber-500 text-white font-mono text-[9px] font-bold rounded-full animate-bounce">
                  Preview
                </span>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-base font-black text-slate-900 truncate">{displayName || user.displayName}</h3>
                <span className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded border bg-white ${rank.color}`}>
                  {rank.title}
                </span>
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-[11px] font-mono font-semibold text-slate-500">
                  @{user.username || (displayName || user.displayName).toLowerCase().replace(/\s+/g, '')}
                </span>
                <span className="text-xs font-mono font-bold text-emerald-700">
                  · {user.elo} ELO
                </span>
              </div>
            </div>
          </div>

          {/* Stats Bar */}
          <div className="grid grid-cols-4 gap-1.5 text-center bg-slate-50 p-2 rounded-xl border border-slate-200 text-xs font-bold">
            <div>
              <div className="text-slate-400 text-[9px] uppercase font-mono">Wins</div>
              <div className="text-emerald-700 font-black text-sm">{user.wins}</div>
            </div>
            <div>
              <div className="text-slate-400 text-[9px] uppercase font-mono">Losses</div>
              <div className="text-rose-600 font-black text-sm">{user.losses}</div>
            </div>
            <div>
              <div className="text-slate-400 text-[9px] uppercase font-mono">Draws</div>
              <div className="text-amber-600 font-black text-sm">{user.draws}</div>
            </div>
            <div>
              <div className="text-slate-400 text-[9px] uppercase font-mono">Win Rate</div>
              <div className="text-slate-900 font-black text-sm">{winRate}%</div>
            </div>
          </div>

          {/* EDIT FORM */}
          <form onSubmit={handleSave} className="space-y-2.5">
            {/* Display Name */}
            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">
                Display Name (In-Game Name)
              </label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Enter display name..."
                required
                maxLength={24}
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-1.5 text-xs text-slate-900 font-bold focus:outline-none focus:border-emerald-600"
              />
            </div>

            {/* Animated Avatars Gallery Picker */}
            <div>
              {/* Scrollable 6-Column Avatar Grid */}
              <div className="max-h-48 overflow-y-auto grid grid-cols-4 sm:grid-cols-6 gap-1.5 p-1.5 bg-slate-50 rounded-xl border border-slate-200">
                {filteredAvatars.length === 0 ? (
                  <div className="col-span-full py-6 text-center text-xs font-mono text-slate-400">
                    No avatars available
                  </div>
                ) : (
                  filteredAvatars.map((av) => {
                    const fullUrl = getAvatarPublicUrl(av.filename);
                    const isSelected = selectedPhotoURL === fullUrl || selectedPhotoURL.includes(encodeURIComponent(av.filename));

                    return (
                      <button
                        key={av.id}
                        type="button"
                        onClick={() => setSelectedPhotoURL(fullUrl)}
                        onMouseEnter={() => setHoveredAvatarFilename(av.filename)}
                        onMouseLeave={() => setHoveredAvatarFilename(null)}
                        title={av.name}
                        className={`p-1 rounded-xl transition border flex flex-col items-center justify-center bg-white aspect-square relative group ${
                          isSelected
                            ? 'border-emerald-600 ring-2 ring-emerald-400 bg-emerald-50/50 scale-105 z-10'
                            : 'border-slate-200 hover:border-slate-400 hover:bg-slate-100'
                        }`}
                      >
                        <img
                          src={getAvatarLocalUrl(av.filename)}
                          alt={av.name}
                          className="w-8 h-8 object-contain"
                        />
                        <span className="text-[9px] font-mono text-slate-600 font-semibold truncate w-full text-center mt-0.5 group-hover:text-emerald-700">
                          {av.name}
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            {/* Save & Feedback */}
            <div className="flex items-center gap-2 pt-1">
              <button
                type="submit"
                className="flex-1 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition shadow-sm"
              >
                {isSavedSuccess ? '✓ Profile & Avatar Saved!' : 'Save Profile Changes'}
              </button>
            </div>
          </form>

          {/* CHANGE PASSWORD SECTION */}
          {!user.isGuest && (
            <div className="pt-2.5 border-t border-slate-200 space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-[11px] font-mono font-extrabold text-slate-800 uppercase tracking-wider">
                  🔐 Change Password
                </h4>
                <span className="text-[10px] text-slate-400 font-mono">Min 6 characters</span>
              </div>

              {passwordError && (
                <div className="bg-rose-50 border border-rose-200 p-2 rounded-xl text-rose-800 text-xs font-bold">
                  ⚠️ {passwordError}
                </div>
              )}

              {passwordSuccess && (
                <div className="bg-emerald-50 border border-emerald-200 p-2 rounded-xl text-emerald-800 text-xs font-bold">
                  ✓ {passwordSuccess}
                </div>
              )}

              <form onSubmit={handlePasswordSubmit} className="space-y-2">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-700 mb-0.5">
                      New Password
                    </label>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="New password..."
                      required
                      minLength={6}
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl px-2.5 py-1.5 text-xs font-bold text-slate-900 focus:outline-none focus:border-emerald-600"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-700 mb-0.5">
                      Confirm New Password
                    </label>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Confirm password..."
                      required
                      minLength={6}
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl px-2.5 py-1.5 text-xs font-bold text-slate-900 focus:outline-none focus:border-emerald-600"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2 pt-0.5">
                  <label className="flex items-center gap-1.5 cursor-pointer text-[11px] font-bold text-slate-600 select-none">
                    <input
                      type="checkbox"
                      checked={showPassword}
                      onChange={(e) => setShowPassword(e.target.checked)}
                      className="rounded text-emerald-600 focus:ring-emerald-500"
                    />
                    <span>Show Password</span>
                  </label>

                  <button
                    type="submit"
                    disabled={isChangingPassword || !newPassword || !confirmPassword}
                    className="py-1.5 px-3.5 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-white font-bold text-xs transition"
                  >
                    {isChangingPassword ? 'Updating...' : 'Update Password'}
                  </button>
                </div>
              </form>
            </div>
          )}

        </div>
      </div>
    </div>
  );
};
