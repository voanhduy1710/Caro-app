import { t } from '../../features/i18n/language';

/** Compact, readable duration for reconnect and grace-period UI. */
export const formatReconnectDuration = (seconds: number): string => {
  const safeSeconds = Math.max(0, Math.ceil(seconds));
  const hours = Math.floor(safeSeconds / 3_600);
  const minutes = Math.floor((safeSeconds % 3_600) / 60);
  const remainder = safeSeconds % 60;
  if (hours > 0) return t('game.durationHours', { h: hours, m: minutes });
  if (minutes > 0) return t('game.durationMinutes', { m: minutes, s: remainder });
  return t('game.durationSeconds', { s: remainder });
};
