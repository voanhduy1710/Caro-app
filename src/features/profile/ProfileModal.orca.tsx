/*
 * Orca style (PR 5) look of the profile dialog. ProfileModal owns every piece
 * of state and every handler (save, today's password form with
 * PASSWORD_MIN_LENGTH and a confirm field, no reset-to-a-fixed-password) and
 * hands them here; this file is markup only.
 */
import React from 'react';
import { AlertTriangle, Check, Lock, UserPlus, X } from 'lucide-react';
import type { UserProfile } from '../auth/AuthContext';
import { RankBadge } from '../../shared/components/RankBadge';
import { getAvatarPublicUrl, getChampionId } from '../avatar/avatarService';
import type { AvatarItem } from '../avatar/avatarService';
import { PASSWORD_MIN_LENGTH } from '../auth/authRules';
import { useT } from '../i18n/language';

export interface ProfileOrcaViewModel {
  dialogProps: Record<string, unknown>;
  user: UserProfile;
  rank: { title: string; color: string };
  winRate: number;
  closeProfile: () => void;
  onOpenAuth: (tab: 'signin' | 'create') => void;
  displayName: string;
  setDisplayName: (value: string) => void;
  activeAvatarPreviewUrl: string;
  hoveredAvatarFilename: string | null;
  setHoveredAvatarFilename: (value: string | null) => void;
  avatarSource: 'lol' | 'ragnarok';
  setAvatarSource: (value: 'lol' | 'ragnarok') => void;
  isLoadingRagnarok: boolean;
  filteredAvatars: AvatarItem[];
  selectedPhotoURL: string;
  setSelectedPhotoURL: (value: string) => void;
  selectedChampion: string | null;
  handleSave: (e: React.FormEvent) => void;
  isSaving: boolean;
  isSavedSuccess: boolean;
  saveError: string | null;
  newPassword: string;
  setNewPassword: (value: string) => void;
  confirmPassword: string;
  setConfirmPassword: (value: string) => void;
  showPassword: boolean;
  setShowPassword: (value: boolean) => void;
  passwordError: string | null;
  passwordSuccess: string | null;
  isChangingPassword: boolean;
  handlePasswordSubmit: (e: React.FormEvent) => void;
}

const segmentClass = (selected: boolean) =>
  `h-6 rounded-[5px] border px-2.5 text-xs font-medium transition-colors ${
    selected
      ? 'border-line bg-surface text-ink shadow-[0_1px_2px_rgb(0_0_0/0.12)]'
      : 'border-transparent text-muted hover:text-ink'
  }`;

export const ProfileModalOrcaView: React.FC<{ m: ProfileOrcaViewModel }> = ({ m }) => {
  const t = useT();
  const { user } = m;
  const streak = user.streak || 0;

  return (
    <div {...m.dialogProps} className="modal-scrim">
      <div className="modal-panel relative flex max-h-[90dvh] max-w-xl flex-col overflow-hidden">
        <div className="flex shrink-0 items-center justify-between border-b border-line px-5 py-3.5">
          <div>
            <h2 id="profile-modal-title" className="text-sm font-semibold text-ink">
              Profile
            </h2>
            <p className="text-xs text-muted">
              {t(user.isGuest ? 'profile.orca.subtitleGuest' : 'profile.orca.subtitleAccount')}
            </p>
          </div>
          <button type="button" onClick={m.closeProfile} className="orca-icon-btn" aria-label="Close">
            <X size={15} strokeWidth={1.75} aria-hidden="true" />
          </button>
        </div>

        <div className="scrollbar-orca flex-1 space-y-4 overflow-y-auto p-5">
          {/* The card, with a live preview of the avatar under the pointer. */}
          <div className="flex items-center gap-3.5 rounded-md border border-line bg-surface-2 p-3">
            <div className="relative shrink-0">
              <img
                src={m.activeAvatarPreviewUrl}
                alt="Selected Avatar"
                onError={(e) => {
                  e.currentTarget.onerror = null;
                  e.currentTarget.src = getAvatarPublicUrl();
                }}
                className="h-12 w-12 rounded-md border border-line-strong bg-surface object-cover"
              />
              {m.hoveredAvatarFilename && (
                <span className="absolute -right-1 -top-1 rounded-[4px] border border-warning/40 bg-warning-solid px-1 font-mono text-[9px] font-semibold text-warning-fg">
                  Preview
                </span>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <h3 className="truncate text-sm font-semibold text-ink">{m.displayName || user.displayName}</h3>
                <RankBadge elo={user.elo} size={22} />
                <span className={`rounded-[4px] border bg-surface px-1.5 font-mono text-[10px] font-medium ${m.rank.color}`}>
                  {m.rank.title}
                </span>
              </div>
              <div className="mt-0.5 flex flex-wrap items-center gap-2 font-mono text-xs tabular-nums">
                <span className="text-muted">
                  @{user.username || (m.displayName || user.displayName).toLowerCase().replace(/\s+/g, '')}
                </span>
                <span className="text-subtle">·</span>
                <span className="font-semibold text-accent-text">{user.elo} ELO</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-5 divide-x divide-line overflow-hidden rounded-md border border-line bg-surface text-center">
            {[
              { label: 'Wins', value: user.wins, tone: 'text-success' },
              { label: 'Losses', value: user.losses, tone: 'text-danger' },
              { label: 'Draws', value: user.draws, tone: 'text-warning' },
              { label: 'Win Rate', value: `${m.winRate}%`, tone: 'text-ink' },
              {
                label: t('profile.orca.streak'),
                value: streak > 0 ? `+${streak}W` : streak < 0 ? `${streak}L` : '0',
                tone: streak > 0 ? 'text-success' : streak < 0 ? 'text-danger' : 'text-muted',
              },
            ].map((cell) => (
              <div key={cell.label} className="px-2 py-2">
                <div className="text-[10.5px] text-subtle">{cell.label}</div>
                <div className={`mt-0.5 font-mono text-xs font-semibold tabular-nums ${cell.tone}`}>{cell.value}</div>
              </div>
            ))}
          </div>

          {user.isGuest && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-accent/30 bg-accent-soft p-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-ink">
                  <UserPlus size={13.5} strokeWidth={1.75} className="shrink-0 text-accent-text" aria-hidden="true" />
                  {t('profile.orca.guestTitle')}
                </div>
                <p className="mt-0.5 text-[11.5px] text-muted">{t('profile.orca.guestBody')}</p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <button type="button" onClick={() => m.onOpenAuth('signin')} className="btn btn-secondary btn-sm">
                  Sign in
                </button>
                <button type="button" onClick={() => m.onOpenAuth('create')} className="btn btn-primary btn-sm">
                  Create account
                </button>
              </div>
            </div>
          )}

          <form onSubmit={m.handleSave} className="space-y-3.5">
            <div className="field">
              <label htmlFor="profile-display-name" className="field-label">
                Display name
              </label>
              <input
                id="profile-display-name"
                type="text"
                value={m.displayName}
                onChange={(e) => m.setDisplayName(e.target.value)}
                placeholder="Enter display name..."
                required
                maxLength={24}
                className="field-input"
              />
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="field-label">Avatar collection</span>
                <div className="inline-flex rounded-[6px] border border-line bg-surface-2 p-0.5">
                  <button
                    type="button"
                    onClick={() => m.setAvatarSource('lol')}
                    aria-pressed={m.avatarSource === 'lol'}
                    className={segmentClass(m.avatarSource === 'lol')}
                  >
                    LoL
                  </button>
                  <button
                    type="button"
                    onClick={() => m.setAvatarSource('ragnarok')}
                    aria-pressed={m.avatarSource === 'ragnarok'}
                    className={segmentClass(m.avatarSource === 'ragnarok')}
                  >
                    Ragnarok
                  </button>
                </div>
              </div>

              <div className="scrollbar-orca grid max-h-48 grid-cols-4 gap-1.5 overflow-y-auto rounded-md border border-line bg-surface-2 p-1.5 sm:grid-cols-6">
                {m.isLoadingRagnarok ? (
                  <div className="col-span-full py-6 text-center font-mono text-xs text-subtle">Loading Ragnarok avatars…</div>
                ) : m.filteredAvatars.length === 0 ? (
                  <div className="col-span-full py-6 text-center font-mono text-xs text-subtle">No avatars available</div>
                ) : (
                  m.filteredAvatars.map((av) => {
                    // Ragnarok keys are not champions: only the LoL collection
                    // falls back to matching the legacy champion URL.
                    const isSelected =
                      m.selectedPhotoURL === av.filename ||
                      (m.avatarSource === 'lol' && m.selectedChampion === getChampionId(av.filename));
                    return (
                      <button
                        key={av.id}
                        type="button"
                        onClick={() => m.setSelectedPhotoURL(av.filename)}
                        onMouseEnter={() => m.setHoveredAvatarFilename(av.filename)}
                        onMouseLeave={() => m.setHoveredAvatarFilename(null)}
                        title={av.name}
                        className={`group relative flex aspect-square flex-col items-center justify-center rounded-[6px] border p-1 transition-colors ${
                          isSelected
                            ? 'z-10 border-accent bg-accent-soft ring-1 ring-accent'
                            : 'border-line bg-surface hover:border-line-strong hover:bg-surface-3/60'
                        }`}
                      >
                        <img
                          src={getAvatarPublicUrl(av.filename)}
                          alt={av.name}
                          loading="lazy"
                          decoding="async"
                          onError={(e) => {
                            e.currentTarget.onerror = null;
                            e.currentTarget.src = getAvatarPublicUrl();
                          }}
                          className="h-8 w-8 rounded-xs object-cover"
                        />
                        <span className="mt-0.5 w-full truncate text-center font-mono text-[9.5px] font-medium text-muted group-hover:text-ink">
                          {av.name}
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            {m.saveError && (
              <div
                role="alert"
                className="flex items-center gap-1.5 rounded-md border border-danger/30 bg-danger-soft p-2.5 text-xs font-medium text-danger"
              >
                <AlertTriangle size={14} strokeWidth={1.75} className="shrink-0" aria-hidden="true" />
                {m.saveError}
              </div>
            )}
            <div className="flex items-center gap-2">
              {/* aria-disabled, not disabled: disabling the focused button
                  would drop focus to the page body. */}
              <button type="submit" aria-disabled={m.isSaving} className="btn btn-primary btn-sm flex-1">
                {m.isSaving ? (
                  'Saving...'
                ) : m.isSavedSuccess ? (
                  <>
                    <Check size={14} strokeWidth={1.75} aria-hidden="true" />
                    Saved
                  </>
                ) : (
                  'Save changes'
                )}
              </button>
              <span role="status" className="sr-only">
                {m.isSaving ? 'Saving your profile' : m.isSavedSuccess ? 'Profile saved' : ''}
              </span>
            </div>
          </form>

          {!user.isGuest && (
            <div className="space-y-3 border-t border-line pt-3.5">
              <div className="flex items-center justify-between">
                <h4 className="flex items-center gap-1.5 text-xs font-semibold text-ink">
                  <Lock size={13.5} strokeWidth={1.75} aria-hidden="true" />
                  {t('profile.password.title')}
                </h4>
                <span className="font-mono text-[10.5px] text-subtle">
                  {t('profile.password.minLength', { n: PASSWORD_MIN_LENGTH })}
                </span>
              </div>

              {m.passwordError && (
                <div
                  role="alert"
                  className="flex items-center gap-1.5 rounded-md border border-danger/30 bg-danger-soft p-2.5 text-xs font-medium text-danger"
                >
                  <AlertTriangle size={14} strokeWidth={1.75} className="shrink-0" aria-hidden="true" />
                  {m.passwordError}
                </div>
              )}

              {m.passwordSuccess && (
                <div className="flex items-center gap-1.5 rounded-md border border-accent/30 bg-accent-soft p-2.5 text-xs font-medium text-accent-text">
                  <Check size={14} strokeWidth={1.75} className="shrink-0" aria-hidden="true" />
                  {m.passwordSuccess}
                </div>
              )}

              <form onSubmit={m.handlePasswordSubmit} className="space-y-2.5">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <div className="field">
                    <label htmlFor="profile-new-password" className="field-label text-xs">
                      {t('profile.password.new')}
                    </label>
                    <input
                      id="profile-new-password"
                      type={m.showPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      value={m.newPassword}
                      onChange={(e) => m.setNewPassword(e.target.value)}
                      placeholder={t('profile.password.newPlaceholder')}
                      required
                      minLength={PASSWORD_MIN_LENGTH}
                      className="field-input py-1.5 text-xs"
                    />
                  </div>

                  <div className="field">
                    <label htmlFor="profile-confirm-password" className="field-label text-xs">
                      {t('profile.password.confirm')}
                    </label>
                    <input
                      id="profile-confirm-password"
                      type={m.showPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      value={m.confirmPassword}
                      onChange={(e) => m.setConfirmPassword(e.target.value)}
                      placeholder={t('profile.password.confirmPlaceholder')}
                      required
                      minLength={PASSWORD_MIN_LENGTH}
                      className="field-input py-1.5 text-xs"
                    />
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
                  <label className="flex cursor-pointer select-none items-center gap-1.5 text-xs text-muted">
                    <input
                      type="checkbox"
                      checked={m.showPassword}
                      onChange={(e) => m.setShowPassword(e.target.checked)}
                      className="rounded-xs accent-accent"
                    />
                    <span>{t('profile.password.show')}</span>
                  </label>

                  <div className="ml-auto flex items-center gap-1.5">
                    <button
                      type="submit"
                      disabled={m.isChangingPassword || !m.newPassword || !m.confirmPassword}
                      className="btn btn-primary btn-sm"
                    >
                      {m.isChangingPassword ? t('profile.password.updating') : t('profile.password.update')}
                    </button>
                  </div>
                </div>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
