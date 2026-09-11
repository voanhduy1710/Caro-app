import React, { useState, useCallback, useEffect } from 'react';
import { X, Check, AlertTriangle, Lock } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { useModalChrome } from '../../shared/hooks/useModalChrome';
import { getRankTitle } from '../../shared/utils/eloCalculator';
import { AVATAR_ITEMS, getAvatarPublicUrl } from '../avatar/avatarService';

export const ProfileModal: React.FC = () => {
  const { user, showProfileModal, setShowProfileModal, updateUserProfile, changePassword } = useAuth();
  const closeProfile = useCallback(() => setShowProfileModal(false), [setShowProfileModal]);
  const dialogProps = useModalChrome(showProfileModal, closeProfile, 'profile-modal-title');

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
      setSelectedPhotoURL(user.photoURL || getAvatarPublicUrl());
    }
  }, [user, showProfileModal]);

  if (!showProfileModal || !user) return null;

  const rank = getRankTitle(user.elo);
  const totalGames = user.wins + user.losses + user.draws;
  const winRate = totalGames > 0 ? Math.round((user.wins / totalGames) * 100) : 0;

  const filteredAvatars = AVATAR_ITEMS;

  // Active preview avatar URL (Hover preview overrides active selection)
  const activeAvatarPreviewUrl = hoveredAvatarFilename
    ? getAvatarPublicUrl(hoveredAvatarFilename)
    : getAvatarPublicUrl(selectedPhotoURL);

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
      {...dialogProps}
      className="modal-scrim"
    >
      <div className="modal-panel max-w-xl relative p-4 sm:p-5 space-y-3 overflow-hidden max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-line pb-2 shrink-0">
          <div>
            <h2 id="profile-modal-title" className="text-xl text-ink">
              Profile
            </h2>
          </div>
          <button
            onClick={() => setShowProfileModal(false)}
            className="btn btn-ghost btn-icon"
            aria-label="Close"
          >
            <X size={18} strokeWidth={2.25} aria-hidden="true" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto space-y-3 pr-1">
          {/* Main User Card Header & Interactive Live Hover Preview */}
          <div className="bg-surface-2 border border-line p-2.5 rounded-md flex items-center gap-3">
            <div className="relative shrink-0">
              <img
                src={activeAvatarPreviewUrl}
                alt="Selected Avatar"
                onError={(e) => {
                  e.currentTarget.onerror = null;
                  e.currentTarget.src = getAvatarPublicUrl();
                }}
                className="w-12 h-12 rounded-md border-2 border-accent bg-surface shadow-sm object-cover"
              />
              {hoveredAvatarFilename && (
                <span className="absolute -top-1 -right-1 px-1.5 py-0.5 bg-warning-solid text-warning-fg font-mono text-[9px] font-medium rounded-full animate-bounce">
                  Preview
                </span>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-base font-semibold text-ink truncate">{displayName || user.displayName}</h3>
                <span className={`text-[9px] font-mono font-medium px-1.5 py-0.5 rounded-sm border bg-surface ${rank.color}`}>
                  {rank.title}
                </span>
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-[11px] font-mono font-semibold text-muted">
                  @{user.username || (displayName || user.displayName).toLowerCase().replace(/\s+/g, '')}
                </span>
                <span className="text-xs font-mono font-medium text-accent-text">
                  · {user.elo} ELO
                </span>
              </div>
            </div>
          </div>

          {/* Stats Bar */}
          <div className="grid grid-cols-4 gap-1.5 text-center bg-surface-2 p-2 rounded-md border border-line text-xs font-medium">
            <div>
              <div className="text-subtle text-[11px]">Wins</div>
              <div className="text-accent-text font-semibold text-sm">{user.wins}</div>
            </div>
            <div>
              <div className="text-subtle text-[11px]">Losses</div>
              <div className="text-danger font-semibold text-sm">{user.losses}</div>
            </div>
            <div>
              <div className="text-subtle text-[11px]">Draws</div>
              <div className="text-warning font-semibold text-sm">{user.draws}</div>
            </div>
            <div>
              <div className="text-subtle text-[11px]">Win Rate</div>
              <div className="text-ink font-semibold text-sm">{winRate}%</div>
            </div>
          </div>

          {/* EDIT FORM */}
          <form onSubmit={handleSave} className="space-y-2.5">
            {/* Display Name */}
            <div>
              <label className="block text-[11px] font-medium text-ink mb-1">
                Display name
              </label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Enter display name..."
                required
                maxLength={24}
                className="w-full bg-surface-2 border border-line-strong rounded-md px-3 py-1.5 text-xs text-ink font-medium focus:outline-none focus:border-accent"
              />
            </div>

            {/* Animated Avatars Gallery Picker */}
            <div>
              {/* Scrollable 6-Column Avatar Grid */}
              <div className="max-h-48 overflow-y-auto grid grid-cols-4 sm:grid-cols-6 gap-1.5 p-1.5 bg-surface-2 rounded-md border border-line">
                {filteredAvatars.length === 0 ? (
                  <div className="col-span-full py-6 text-center text-xs font-mono text-subtle">
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
                        className={`p-1 rounded-md transition border flex flex-col items-center justify-center bg-surface aspect-square relative group ${
                          isSelected
                            ? 'border-accent ring-2 ring-accent bg-accent-soft scale-105 z-10'
                            : 'border-line hover:border-line-strong hover:bg-surface-3'
                        }`}
                      >
                        <img
                          src={fullUrl}
                          alt={av.name}
                          loading="lazy"
                          decoding="async"
                          onError={(e) => {
                            e.currentTarget.onerror = null;
                            e.currentTarget.src = getAvatarPublicUrl();
                          }}
                          className="w-8 h-8 rounded-sm object-cover"
                        />
                        <span className="text-[9px] font-mono text-muted font-semibold truncate w-full text-center mt-0.5 group-hover:text-accent-text">
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
                className="btn btn-primary btn-sm flex-1"
              >
                {isSavedSuccess ? (<><Check size={14} strokeWidth={2} aria-hidden="true" />Saved</>) : ('Save changes')}
              </button>
            </div>
          </form>

          {/* CHANGE PASSWORD SECTION */}
          {!user.isGuest && (
            <div className="pt-2.5 border-t border-line space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="flex items-center gap-1.5 text-xs font-semibold text-ink">
                  <Lock size={13} strokeWidth={2.25} aria-hidden="true" />
                  Change password
                </h4>
                <span className="text-[10px] text-subtle font-mono">Min 8 characters</span>
              </div>

              {passwordError && (
                <div className="bg-danger-soft border border-danger p-2 rounded-md text-danger text-xs font-medium">
                  <AlertTriangle size={13} strokeWidth={2.25} className="inline shrink-0 mr-1.5 -mt-0.5" aria-hidden="true" />{passwordError}
                </div>
              )}

              {passwordSuccess && (
                <div className="bg-accent-soft border border-accent p-2 rounded-md text-accent-text text-xs font-medium">
                  <Check size={13} strokeWidth={2} className="inline shrink-0 mr-1.5 -mt-0.5" aria-hidden="true" />{passwordSuccess}
                </div>
              )}

              <form onSubmit={handlePasswordSubmit} className="space-y-2">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] font-medium text-ink mb-0.5">
                      New Password
                    </label>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="New password..."
                      required
                      minLength={8}
                      className="w-full bg-surface-2 border border-line-strong rounded-md px-2.5 py-1.5 text-xs font-medium text-ink focus:outline-none focus:border-accent"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-medium text-ink mb-0.5">
                      Confirm New Password
                    </label>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Confirm password..."
                      required
                      minLength={8}
                      className="w-full bg-surface-2 border border-line-strong rounded-md px-2.5 py-1.5 text-xs font-medium text-ink focus:outline-none focus:border-accent"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2 pt-0.5">
                  <label className="flex items-center gap-1.5 cursor-pointer text-[11px] font-medium text-muted select-none">
                    <input
                      type="checkbox"
                      checked={showPassword}
                      onChange={(e) => setShowPassword(e.target.checked)}
                      className="rounded-sm text-accent-text focus:ring-accent"
                    />
                    <span>Show Password</span>
                  </label>

                  <button
                    type="submit"
                    disabled={isChangingPassword || !newPassword || !confirmPassword}
                    className="btn btn-inverse btn-sm"
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
