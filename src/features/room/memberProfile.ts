import type { UserProfile } from '../auth/AuthContext';
import type { Member } from './roomEngine';

/** Adapts wire-safe room membership data for the profile dialogs. */
export const memberProfile = (member: Member): UserProfile => ({
  uid: member.profile.uid,
  displayName: member.profile.name,
  photoURL: member.profile.avatar ?? '',
  email: '',
  elo: member.profile.elo ?? 1200,
  wins: member.profile.wins ?? 0,
  losses: member.profile.losses ?? 0,
  draws: member.profile.draws ?? 0,
  streak: member.profile.streak ?? 0,
  isGuest: member.profile.guest,
});
