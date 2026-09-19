import type React from 'react';
import type { UserProfile } from '../auth/AuthContext';
import type { RoomApi } from './useRoom';
import type { Member } from './roomEngine';

export type ConfirmSpec = {
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: 'danger' | 'default';
  onConfirm: () => void;
};

export interface OnlineRoomProps {
  room: RoomApi;
  user: UserProfile | null;
  onOpenRules: () => void;
  onViewMyProfile: () => void;
  onViewProfile: (profile: UserProfile) => void;
  exitRef: React.MutableRefObject<(() => void) | null>;
}

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
