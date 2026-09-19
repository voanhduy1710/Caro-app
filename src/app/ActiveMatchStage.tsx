import React from 'react';
import type { UserProfile } from '../features/auth/AuthContext';
import { OnlineRoom } from '../features/room/OnlineRoom';
import type { RoomApi } from '../features/room/useRoom';
import { PracticeMatchView } from './PracticeMatchView';
import type { PracticeMatchViewProps } from './PracticeMatchView';

export const ActiveMatchStage: React.FC<{ roomActive: boolean; room: RoomApi; user: UserProfile | null; onRules: () => void; onMyProfile: () => void; onOpponent: (user: UserProfile) => void; exitRef: React.MutableRefObject<(() => void) | null>; practice: PracticeMatchViewProps | null }> = ({ roomActive, room, user, onRules, onMyProfile, onOpponent, exitRef, practice }) => <>{roomActive && <OnlineRoom room={room} user={user} onOpenRules={onRules} onViewMyProfile={onMyProfile} onViewProfile={onOpponent} exitRef={exitRef} />}{practice && <PracticeMatchView {...practice} />}</>;
